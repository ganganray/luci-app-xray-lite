// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 ganganray <https://github.com/ganganray>

'use strict';
'require form';
'require poll';
'require rpc';
'require uci';
'require view';
'require dom';
'require ui';
'require fs';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('xray'), {}).then(function(res) {
		let isRunning = false;
		try {
			const instances = res?.xray?.instances || {};
			for (const key in instances) {
				if (instances[key] && instances[key].running) {
					isRunning = true;
					break;
				}
			}
		} catch (e) {}
		return isRunning;
	});
}

function renderStatus(isRunning) {
	return E('span', {
		style: 'color: ' + (isRunning ? 'green' : 'red')
	}, [
		E('strong', {}, _('Xray') + ' ' + (isRunning ? _('RUNNING') : _('NOT RUNNING')))
	]);
}

function handleServiceAction(action) {
	ui.showModal(_('Service Action'), [
		E('p', { class: 'spinning' }, _('Executing service %s...').format(action))
	]);

	return fs.exec('/usr/libexec/xray-lite-ctl', ['service', action]).then(function(res) {
		ui.hideModal();
		const statusBar = document.getElementById('service_status');
		getServiceStatus().then(function(isRunning) {
			if (statusBar) {
				dom.content(statusBar, renderStatus(isRunning));
			}
		});

		if (res.code === 0) {
			ui.addNotification(null, E('p', _('Service %s succeeded.').format(action)), 'info');
		} else {
			ui.addNotification(null, E('p', _('Service %s failed: %s').format(action, res.stderr || res.stdout || res.code)), 'danger');
		}
	}).catch(function(err) {
		ui.hideModal();
		ui.addNotification(null, E('p', _('Service %s error: %s').format(action, err.message)), 'danger');
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('xray'),
			L.resolveDefault(fs.exec('/usr/libexec/xray-lite-ctl', ['check-env']), null)
		]);
	},

	render: function(data) {
		let env = null;
		try {
			if (data && data[1] && data[1].stdout) {
				env = JSON.parse(data[1].stdout.trim());
			}
		} catch (e) {}

		const m = new form.Map('xray', _('Xray Settings'),
			_('Lightweight Xray configuration for local outbound proxy backend (cooperating with dae, sing-box, mihomo, etc.).'));

		const s_status = m.section(form.TypedSection);
		s_status.anonymous = true;
		s_status.render = function() {
			poll.add(function() {
				return getServiceStatus().then(function(isRunning) {
					const view = document.getElementById('service_status');
					if (view) {
						dom.content(view, renderStatus(isRunning));
					}
				});
			});

			const btnStart = E('button', {
				class: 'btn cbi-button cbi-button-action',
				style: 'margin-right: 8px;',
				click: ui.createHandlerFn(this, function() {
					return handleServiceAction('start');
				})
			}, _('Start'));

			const btnStop = E('button', {
				class: 'btn cbi-button cbi-button-reset',
				style: 'margin-right: 8px;',
				click: ui.createHandlerFn(this, function() {
					return handleServiceAction('stop');
				})
			}, _('Stop'));

			const btnRestart = E('button', {
				class: 'btn cbi-button cbi-button-reload',
				click: ui.createHandlerFn(this, function() {
					return handleServiceAction('restart');
				})
			}, _('Restart'));

			const elements = [
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Service Status')),
					E('div', { class: 'cbi-value-field' }, [
						E('div', { id: 'service_status', style: 'padding-top: 5px;' }, _('Collecting data…'))
					])
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('Control Actions')),
					E('div', { class: 'cbi-value-field' }, [
						btnStart, btnStop, btnRestart
					])
				])
			];

			if (env && env.is_official_init === false) {
				elements.unshift(
					E('div', { class: 'alert-message warning', style: 'margin-bottom: 12px;' }, [
						E('strong', {}, _('Custom Startup Script Detected: ')),
						_('A custom /etc/init.d/xray startup script is running. Control buttons will trigger your custom script. UCI options below are available for standard migration and configuration testing.')
					])
				);
			}

			return E('div', { class: 'cbi-section' }, elements);
		};

		// Section: enabled
		const s_enabled = m.section(form.NamedSection, 'enabled', 'xray', _('Service Switch'));
		const o_enabled = s_enabled.option(form.Flag, 'enabled', _('Enable Xray Service'),
			_('Enable or disable Xray service auto-start.'));
		o_enabled.rmempty = false;

		// Section: config
		const s_config = m.section(form.NamedSection, 'config', 'xray', _('Runtime Parameters'));

		const o_confdir = s_config.option(form.Value, 'confdir', _('Configuration Directory (confdir)'),
			_('Directory containing multiple JSON files (maps to -confdir). Note: Leave empty when specifying single conffiles to prevent duplicate loading.'));
		o_confdir.placeholder = '/etc/xray';
		o_confdir.rmempty = true;

		const o_conffiles = s_config.option(form.DynamicList, 'conffiles', _('Configuration Files (conffiles)'),
			_('List of specific configuration files (maps to -config). Default: /etc/xray/config.json'));
		o_conffiles.placeholder = '/etc/xray/config.json';
		o_conffiles.rmempty = true;

		const o_datadir = s_config.option(form.Value, 'datadir', _('Asset Directory (datadir)'),
			_('Directory containing geoip.dat and geosite.dat (injected as XRAY_LOCATION_ASSET).'));
		o_datadir.placeholder = env?.datadir || '/usr/share/xray';
		o_datadir.rmempty = true;

		const o_format = s_config.option(form.ListValue, 'format', _('Configuration Format'),
			_('Configuration file format.'));
		o_format.value('json', 'JSON');
		o_format.value('jsonv4', 'JSONv4');
		o_format.value('toml', 'TOML');
		o_format.value('yaml', 'YAML');
		o_format.default = 'json';

		const o_dialer = s_config.option(form.Value, 'dialer', _('Browser Dialer'),
			_('Optional browser dialer target address (injected as XRAY_BROWSER_DIALER).'));
		o_dialer.placeholder = '';
		o_dialer.rmempty = true;

		return m.render();
	}
});
