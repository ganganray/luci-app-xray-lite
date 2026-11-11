// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 ganganray <https://github.com/ganganray>

'use strict';
'require dom';
'require fs';
'require poll';
'require view';
'require ui';

return view.extend({
	logLinesLimit: '250',
	autoScrollTail: true,

	render: function() {
		const self = this;

		const logBox = E('pre', {
			id: 'xray_log_content',
			style: 'background-color: #1e1e1e; color: #d4d4d4; padding: 12px; font-family: monospace, Consolas, "Courier New", Courier; font-size: 12px; line-height: 1.4; max-height: 650px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; border-radius: 4px; border: 1px solid #333;'
		}, [_('Collecting log data…')]);

		const linesSelect = E('select', {
			class: 'cbi-input-select',
			style: 'margin-right: 10px;'
		}, [
			E('option', { value: '100' }, _('Last 100 lines')),
			E('option', { value: '250', selected: 'selected' }, _('Last 250 lines')),
			E('option', { value: '500' }, _('Last 500 lines')),
			E('option', { value: '1000' }, _('Last 1000 lines'))
		]);

		linesSelect.addEventListener('change', function() {
			self.logLinesLimit = this.value;
			updateLog();
		});

		const btnScrollTail = E('button', {
			class: 'btn cbi-button cbi-button-neutral',
			style: 'margin-right: 8px;'
		}, _('Scroll to Bottom'));

		btnScrollTail.addEventListener('click', function() {
			logBox.scrollTop = logBox.scrollHeight;
		});

		const btnScrollHead = E('button', {
			class: 'btn cbi-button cbi-button-neutral',
			style: 'margin-right: 8px;'
		}, _('Scroll to Top'));

		btnScrollHead.addEventListener('click', function() {
			logBox.scrollTop = 0;
		});

		const btnClear = E('button', {
			class: 'btn cbi-button cbi-button-reset',
			style: 'margin-right: 8px;'
		}, _('Clear Screen'));

		btnClear.addEventListener('click', function() {
			dom.content(logBox, [_('Screen cleared.')]);
		});

		function updateLog() {
			return fs.exec('/usr/libexec/xray-lite-ctl', ['read-log', self.logLinesLimit]).then(function(res) {
				const logText = (res.code === 0 && res.stdout) ? res.stdout.trim() : '';
				const content = logText.length > 0 ? logText : _('No Xray logs found or service is stopped.');
				
				const shouldScroll = self.autoScrollTail && (logBox.scrollHeight - logBox.clientHeight <= logBox.scrollTop + 50);
				dom.content(logBox, [content]);
				if (shouldScroll) {
					logBox.scrollTop = logBox.scrollHeight;
				}
			}).catch(function(err) {
				dom.content(logBox, [_('Failed to read logs: %s').format(err.message)]);
			});
		}

		poll.add(updateLog.bind(this));

		return E('div', { class: 'cbi-map' }, [
			E('h2', {}, [_('Xray Logs')]),
			E('div', { class: 'cbi-map-descr' }, [
				_('Real-time system log output filtered for Xray process. Refreshes every %s seconds.').format(L.env.pollinterval || 3)
			]),
			E('div', { class: 'cbi-section' }, [
				E('div', { style: 'margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;' }, [
					E('div', {}, [
						btnScrollTail,
						btnScrollHead,
						btnClear
					]),
					E('div', { style: 'display: flex; align-items: center;' }, [
						E('label', { style: 'margin-right: 6px; font-weight: bold;' }, _('Lines:')),
						linesSelect
					])
				]),
				logBox,
				E('div', { style: 'margin-top: 12px;' }, [
					btnScrollTail,
					btnScrollHead
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
