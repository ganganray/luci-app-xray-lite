// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 ganganray <https://github.com/ganganray>

'use strict';
'require view';
'require dom';
'require ui';
'require fs';

return view.extend({
	currentFile: '/etc/xray/config.json',
	fileList: ['/etc/xray/config.json'],
	initialContent: '',

	load: function() {
		const self = this;
		return fs.exec('/usr/libexec/xray-lite-ctl', ['list-configs']).then(function(res) {
			let files = [];
			if (res.code === 0 && res.stdout) {
				files = res.stdout.trim().split(/\n/).map(function(s) {
					return s.trim();
				}).filter(function(s) {
					return s.length > 0;
				});
			}
			if (files.length === 0) {
				files = ['/etc/xray/config.json'];
			}
			self.fileList = files;
			if (!self.fileList.includes(self.currentFile)) {
				self.currentFile = self.fileList[0];
			}
			return fs.exec('/usr/libexec/xray-lite-ctl', ['read-config', self.currentFile]);
		}).then(function(readRes) {
			const content = (readRes.code === 0 && readRes.stdout) ? readRes.stdout : '';
			self.initialContent = content;
			return {
				files: self.fileList,
				currentFile: self.currentFile,
				content: content
			};
		}).catch(function(err) {
			ui.addNotification(null, E('p', _('Failed to load configuration: %s').format(err.message)), 'danger');
			return {
				files: ['/etc/xray/config.json'],
				currentFile: '/etc/xray/config.json',
				content: ''
			};
		});
	},

	render: function(data) {
		const self = this;
		self.currentFile = data.currentFile;
		self.initialContent = data.content;

		const alertBox = E('div', { id: 'config_alert', style: 'margin-bottom: 15px;' });

		const selectFile = E('select', {
			id: 'select_config_file',
			class: 'cbi-input-select',
			style: 'min-width: 320px; font-weight: bold;'
		}, data.files.map(function(file) {
			return E('option', {
				value: file,
				selected: (file === data.currentFile) ? 'selected' : null
			}, file);
		}));

		const textarea = E('textarea', {
			id: 'config_textarea',
			class: 'cbi-input-textarea',
			style: 'font-family: monospace, Consolas, "Courier New", Courier; font-size: 13px; line-height: 1.5; width: 100%; tab-size: 2; -moz-tab-size: 2;',
			rows: 32,
			wrap: 'off',
			spellcheck: 'false'
		}, [data.content]);

		// Enable Tab indentation inside textarea
		textarea.addEventListener('keydown', function(e) {
			if (e.key === 'Tab') {
				e.preventDefault();
				const start = this.selectionStart;
				const end = this.selectionEnd;
				const value = this.value;
				this.value = value.substring(0, start) + '  ' + value.substring(end);
				this.selectionStart = this.selectionEnd = start + 2;
			}
		});

		// Switch file handler
		selectFile.addEventListener('change', function() {
			const newFile = this.value;
			if (newFile === self.currentFile) return;

			ui.showModal(_('Loading Configuration'), [
				E('p', { class: 'spinning' }, _('Loading %s...').format(newFile))
			]);

			fs.exec('/usr/libexec/xray-lite-ctl', ['read-config', newFile]).then(function(res) {
				ui.hideModal();
				if (res.code === 0) {
					self.currentFile = newFile;
					self.initialContent = res.stdout;
					textarea.value = res.stdout;
					dom.content(alertBox, []);
				} else {
					ui.addNotification(null, E('p', _('Failed to read file: %s').format(res.stderr || res.stdout)), 'danger');
					selectFile.value = self.currentFile;
				}
			}).catch(function(err) {
				ui.hideModal();
				ui.addNotification(null, E('p', err.message), 'danger');
				selectFile.value = self.currentFile;
			});
		});

		function saveAndApply() {
			const content = textarea.value;

			// 1. Client-side JSON syntax check
			try {
				JSON.parse(content);
			} catch (jsonErr) {
				dom.content(alertBox, [
					E('div', { class: 'alert-message danger' }, [
						E('h4', {}, _('JSON Syntax Error (Client Pre-check)')),
						E('pre', { style: 'white-space: pre-wrap; margin: 0;' }, jsonErr.message)
					])
				]);
				ui.addNotification(null, E('p', _('JSON syntax validation failed! Please check your configuration.')), 'danger');
				return Promise.reject(jsonErr);
			}

			// Clear previous alert
			dom.content(alertBox, []);

			ui.showModal(_('Saving & Testing'), [
				E('p', { class: 'spinning' }, _('Testing configuration with Xray core...'))
			]);

			// 2. Write to temporary file with 0600 mode (384 decimal)
			return fs.write('/etc/xray/.xray-lite.tmp', content, 384).then(function() {
				// 3. Invoke backend helper to test with xray run -test and restart on success
				return fs.exec('/usr/libexec/xray-lite-ctl', ['save-config', self.currentFile]);
			}).then(function(res) {
				ui.hideModal();
				if (res.code === 0) {
					self.initialContent = content;
					dom.content(alertBox, [
						E('div', { class: 'alert-message success' }, [
							E('h4', {}, _('Configuration Applied Successfully')),
							E('p', { style: 'margin: 0;' }, _('Configuration tested OK. Service restarted successfully.'))
						])
					]);
					ui.addNotification(null, E('p', _('Configuration validated and service restarted.')), 'info');
				} else {
					dom.content(alertBox, [
						E('div', { class: 'alert-message danger' }, [
							E('h4', {}, _('Xray Validation Failed - Rolled Back')),
							E('p', {}, _('The configuration test failed. Your changes were NOT applied, and the previous configuration was restored. Details:')),
							E('pre', { style: 'white-space: pre-wrap; background: #fff0f0; padding: 8px; border-radius: 4px;' }, res.stderr || res.stdout || _('Unknown error'))
						])
					]);
					ui.addNotification(null, E('p', _('Configuration test failed! Automatic rollback performed.')), 'danger');
				}
			}).catch(function(err) {
				ui.hideModal();
				dom.content(alertBox, [
					E('div', { class: 'alert-message danger' }, [
						E('h4', {}, _('Save Error')),
						E('p', {}, err.message)
					])
				]);
				ui.addNotification(null, E('p', err.message), 'danger');
			});
		}

		function formatJSON() {
			try {
				const parsed = JSON.parse(textarea.value);
				textarea.value = JSON.stringify(parsed, null, 2);
				dom.content(alertBox, [
					E('div', { class: 'alert-message info' }, _('JSON formatted with 2 spaces indentation.'))
				]);
			} catch (err) {
				ui.addNotification(null, E('p', _('Cannot format invalid JSON: %s').format(err.message)), 'danger');
			}
		}

		function reloadCurrent() {
			textarea.value = self.initialContent;
			dom.content(alertBox, []);
			ui.addNotification(null, E('p', _('Content restored to last loaded state.')), 'info');
		}

		const btnSaveApply = E('button', {
			class: 'btn cbi-button cbi-button-apply',
			style: 'margin-right: 10px;',
			click: ui.createHandlerFn(this, saveAndApply)
		}, _('Save & Apply'));

		const btnFormat = E('button', {
			class: 'btn cbi-button cbi-button-action',
			style: 'margin-right: 10px;',
			click: ui.createHandlerFn(this, formatJSON)
		}, _('Format JSON'));

		const btnReload = E('button', {
			class: 'btn cbi-button cbi-button-reset',
			click: ui.createHandlerFn(this, reloadCurrent)
		}, _('Reset'));

		return E('div', { class: 'cbi-map' }, [
			E('h2', {}, [_('Xray Configuration')]),
			E('div', { class: 'cbi-map-descr' }, [
				_('Directly edit Xray raw JSON configuration. Changes are tested with "xray run -test" before restarting; if the test fails, changes are automatically rolled back to prevent service disruption.')
			]),
			alertBox,
			E('div', { class: 'cbi-section' }, [
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Target File:')),
					E('div', { class: 'cbi-value-field' }, [
						selectFile,
						E('span', { style: 'margin-left: 10px; color: #666;' }, _('(Mode: 0600)'))
					])
				]),
				E('div', { class: 'cbi-value', style: 'padding: 0 10px;' }, [
					textarea
				]),
				E('div', { class: 'cbi-value', style: 'margin-top: 15px;' }, [
					E('div', { class: 'cbi-value-field' }, [
						btnSaveApply,
						btnFormat,
						btnReload
					])
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
