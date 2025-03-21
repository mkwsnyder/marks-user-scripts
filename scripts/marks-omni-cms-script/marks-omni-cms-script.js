// ==UserScript==
// @name         Mark's Omni CMS Script
// @namespace    https://mark-snyder.ou.usu.edu/
// @version      0.6.7
// @description  Adds functionality to the CMS formerly known as OU Campus
// @author       Mark Snyder
// @updateURL    https://raw.githubusercontent.com/mkwsnyder/marks-user-scripts/master/scripts/marks-omni-cms-script/marks-omni-cms-script.js
// @downloadURL    https://raw.githubusercontent.com/mkwsnyder/marks-user-scripts/master/scripts/marks-omni-cms-script/marks-omni-cms-script.js
// @match        https://a.cms.omniupdate.com/11/*
// @icon         https://www.google.com/s2/favicons?domain=omniupdate.com
// @grant        none
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @run-at       document-end
// ==/UserScript==

// TODO:
//  - [ ] Add some kind of "copied!" notification
//  - [x] Refresh button on pages
//  - [x] Use their tooltips instead of just a plain title attribute
//  - [x] Activate all the tooltips at once
//  - [~] Organize code into sections and document that shiz
//  - [x] When running a normal loop check, see if the settings are there, and if not, re-add them (the modal will more than likely still be there, it's just the setting in the dropdown that disappears)
//  - [x] Fix for settings with update functions: when toggling and not saving, they still apply, run them whenever the modal closes...
//  - [x] Fix loop spam on browse pages
//  - [ ] Put links in the config tooltips

/**
 * NOTES:
 *
 * Regarding the skip to source option: for some reason, changing the href for
 * an item in the list simply doesn't work. Uncommenting the "skipToSource" item
 * in the MOS_SETTINGS will add the feature in completion. However, it still
 * doesn't work, despite the fact that it properly updates the href. wtf.
 * Omni CMS is jank.
 */

/**
 * MOS = Marks Omni Script
 *
 * USEFUL VARIABLE LOCATIONS
 * site = window.OU.app.attributes.site
 * user info = window.OU.app.attributes.user
 */

const VER = '0.6'; // only for major updates
const VER_DISPLAY = '0.6.7'; // version to display in modal

const RETRY_TIMEOUT = 250;
const LOOP_TIMEOUT = 200;

// The order of the elements here define the order they display on the settings modal
const MOS_SETTINGS = {
  viewPublishedPageInDropdown: {
    defaultVal: false,
    helpText: 'Adds an option to the <em>File</em> dropdown to view the published version of a file.',
    settingsText: 'Add <em>View Published Page</em> Option to the <em>Files</em> Dropdown',
  },
  sourceButtonInBrowse: {
    defaultVal: false,
    helpText: 'Creates a clickable button to edit the source for a file in the file browser.',
    settingsText: 'Add <em>Edit Source</em> Button in the File Browser',
  },
  viewPublishedPageInBrowse: {
    defaultVal: true,
    helpText: 'Creates a clickable button to view the published version of a file in the file browser.',
    settingsText: 'Add <em>View Published Page</em> Button in File Browser',
  },
  copyDependencyTagInBrowse: {
    defaultVal: true,
    helpText: 'Creates a clickable button to copy the dependency tag for a file in the file browser.',
    settingsText: 'Add <em>Copy Dependency Tag</em> Button in the File Browser',
  },
  // skipToSource: {
  //   defaultVal: 'css, js, html, php, xml, xsl',
  //   helpText: 'Changes the default behavior for clicking on a file in the file browser from the <em>Edit</em> tab to the <em>Source</em> tab. Applies to the selected file extensions. Example formatting (comma separated, no dots): <pre>css, js, html</pre>',
  //   settingsText: 'Skip straight to source for these file extensions',
  // },
  truncateUnpublished: {
    defaultVal: false,
    helpText: 'Truncates the text for <em>UNPUBLISHED CHANGES</em> to <em>UC</em> and <em>UNPUBLISHED</em> to <em>U</em> to save space.',
    settingsText: 'Truncate <em>UNPUBLISHED CHANGES</em> and <em>UNPUBLISHED</em>',
  },
  _darkMode: {
    defaultVal: false,
    helpText: 'Changes to an experimental dark mode. May break things, use at your own risk. Send screenshots to Mark of anything that looks wrong.',
    settingsText: '(BETA) Dark Mode',
    updateFunc: updateDarkMode,
  },
  _debug: {
    defaultVal: false,
    helpText: 'Prints script messages to console when enabled.',
    settingsText: 'Debug Mode',
    updateFunc: updateDebug,
  },
};
// const REG_HASH_SITE = /#.*?\/.*?\/(.*?)\//i;

(() => {
  'use strict';

  // if the page hasn't loaded yet, retry
  //if (!document.querySelector('.page-path') || !document.querySelector('#masthead-user-settings-link')) {
  //  setTimeout(init, RETRY_TIMEOUT);
  //}

  bootstrap();

})();

function bootstrap() {
  
  if (!document.querySelector('#masthead-user-settings-link')) {
    setTimeout(bootstrap, RETRY_TIMEOUT);
  } else init();
}

function init() {
  // check for url match, so it doesn't run in iframes
  if (window.MOS || window.location !== window.parent.location) return;
  loadSettingsFromStorage();

  createSettingsModal();

  createSettingsDropdown();

  newVersionTooltip();

  if (window.MOS._darkMode) insertDarkMode();

  if (window.MOS._debug) console.log('Running Mark\'s Omni CMS Script');

  if (window.onurlchange === null) {
    window.addEventListener('urlchange', (url) => setTimeout(ouLoop, RETRY_TIMEOUT));
  }

  setInterval(ouLoop, LOOP_TIMEOUT);
}

function ouLoop() {

  if (window.MOS._debug) console.log('loop');

  let href = window.location.href;

  // assets can also have "preview" and similar things in the name, so check for assets first
  if (href.includes('assets')) {
    if (location.href.match(/assets\/[0-9]*/i)) assetView();
    else browseAssetsView();
  }

  // preview, previewedit, editimage, editsource, pageparameters, pageaccess, pagereminders, pagelog, pageversions, wysiwyg, multiedit
  else if (href.includes('preview')
    || href.includes('previewedit')
    || href.includes('editimage')
    || href.includes('editsource')
    || href.includes('pageparameters')
    || href.includes('pageaccess')
    || href.includes('pagereminders')
    || href.includes('pagelog')
    || href.includes('pageversions')
    || href.includes('wysiwyg')
    || href.includes('multiedit')) pageView();

  else if (href.includes('browse')) browseView();

  createSettingsDropdown();
}

// ======== SETTINGS ========

function loadSettingsFromStorage() {
  if (!localStorage.MOS) defaultSettings();
  else window.MOS = JSON.parse(localStorage.MOS);

  // update any missing settings with default settings
  for (let e in MOS_SETTINGS) {
    if (window.MOS[e] === undefined) window.MOS[e] = MOS_SETTINGS[e].defaultVal;
  }
}

function saveSettingsToStorage() {
  localStorage.MOS = JSON.stringify(window.MOS);
}

function saveSettingsFromUI() {
  for (let el of document.querySelectorAll('.mos-settings-entry')) {
    switch (el.type) {
      case 'checkbox':
        window.MOS[el.dataset.key] = el.checked;
        break;
      case 'text':
        window.MOS[el.dataset.key] = el.value;
        break;
      default:
        if (window.MOS._debug) console.log(`No handler for saving ${el.type} type inputs.`);
    }
  }
}

function defaultSettings() {
  if (!window.MOS) window.MOS = {};

  for (let e in MOS_SETTINGS) {
    window.MOS[e] = MOS_SETTINGS[e].defaultVal;
  }
}

function createSettingsModal() {

  // don't add it if it's already there
  if (document.querySelector('#mos-settings-modal')) return;
  if (window.MOS._debug) console.log('creating the settings modal');

  let div = document.createElement('div');
  div.id = 'mos-settings-modal';
  div.classList.add('modal');
  div.style.display = 'none';
  div.innerHTML = `
      <div class="modal-dialog modal-dialog-scrollable" role="document">
        <div class="modal-content">
          <img id="nonsense" src="https://mark-snyder.ou.usu.edu/images/party-parrot.gif" style="position: absolute; left: 25%; opacity: .2; ${window.MOS._debug ? '' : 'display: none;'}"/>
          <div class="modal-header bg-primary" style="position: relative;">
            <span class="modal-title h4" style="display: inline-block;">Script Config</span>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body" style="position: relative;">
            <a class="text-muted" href="https://mark-snyder.ou.usu.edu/marks-omni-cms-script#changelog" target="_blank" style="float: right;">Ver. ${VER_DISPLAY}</a>
            <p><a href="https://mark-snyder.ou.usu.edu/marks-omni-cms-script#features" target="_blank">View the full list of features this script adds.</a></p>
            <div id="mos-settings"></div>
          </div>
          <div class="modal-footer" style="position: relative;">
            <button id="mos-settings-default" type="button" class="btn">Reset to Defaults</button>
            <button type="button" class="btn" data-dismiss="modal">Close</button>
            <button id="mos-settings-save" type="button" class="btn" data-dismiss="modal" disabled>Save and Close</button>
          </div>
        </div>
      </div>
    `;

  document.querySelector('body').appendChild(div);

  // restores default settings *and* saves them
  document.querySelector('#mos-settings-default').addEventListener('click', () => {
    defaultSettings();
    updateSettingsFields();
    saveSettingsToStorage(); // TODO: maybe don't do this automatically? but if it's not automatic, it's a hassle to get the "unsaved changes" stuff to show
  });

  // saves settings
  document.querySelector('#mos-settings-save').addEventListener('click', () => {
    saveSettingsFromUI();
    saveSettingsToStorage();
  });

  // unsaved changes get reverted
  $('#mos-settings-modal').on('hidden.bs.modal', () => {
    updateSettingsFields();
    for (let e in MOS_SETTINGS) {
      if (MOS_SETTINGS[e].updateFunc) MOS_SETTINGS[e].updateFunc();
    }
  });
}

function updateSettingsFields() {

  document.querySelector('#mos-settings').innerHTML = '';

  if (!window.MOS) loadSettingsFromStorage();

  let addedHR = false;

  for (let e in MOS_SETTINGS) {

    let el = document.createElement('div');

    let input = () => {
      switch (typeof (MOS_SETTINGS[e].defaultVal)) {
        case 'boolean':
          return `<input id="mos-settings-${e}" class="mos-settings-entry" type="checkbox" data-key="${e}" ${window.MOS[e] ? 'checked="true"' : ''} style="cursor: pointer;">`;
        case 'string':
          return `<input id="mos-settings-${e}" class="mos-settings-entry" type="text" data-key="${e}" value="${window.MOS[e]}"">`;
      }
    };

    el.innerHTML = `
    <i class="icon-help" data-toggle="tooltip" data-html="true" data-placement="right" title="${MOS_SETTINGS[e].helpText}"></i>
    ${input()}
    <label for="mos-settings-${e}" style="cursor: pointer; user-select: none;${typeof (MOS_SETTINGS[e].defaultVal) === 'string' ? ' margin-left: 1.5em;' : ''}">${MOS_SETTINGS[e].settingsText}</label>
    `;

    if (e.startsWith('_') && !addedHR) {
      document.querySelector('#mos-settings').appendChild(document.createElement('hr'));
      addedHR = true;
    }

    document.querySelector('#mos-settings').appendChild(el);

    // TODO: make this dynamically change based on input type attribute
    if (MOS_SETTINGS[e].updateFunc) el.addEventListener('change', MOS_SETTINGS[e].updateFunc);
  }

  for (let el of document.querySelectorAll('.mos-settings-entry')) {
    el.addEventListener('change', checkSettingsStatus);
    if (el.type === 'text') el.addEventListener('keyup', checkSettingsStatus);
  }

  // document.querySelector('#mos-settings-_debug').addEventListener('change', () => {
  //   if (document.querySelector('#mos-settings-_debug').checked) document.querySelector('#nonsense').style.display = '';
  //   else document.querySelector('#nonsense').style.display = 'none';
  // });

  $('#mos-settings [data-toggle="tooltip"]').tooltip();

  checkSettingsStatus();
}

function createSettingsDropdown() {

  if (document.querySelector('#mos-settings-dropdown')) return;
  if (window.MOS._debug) console.log('creating settings dropdown');

  let li = document.createElement('li');

  li.id = 'mos-settings-dropdown'
  li.role = 'none';
  li.innerHTML = `
  <a role="menuitem">
  <i class="icon-wrench"></i> Script Config</a>
  `;

  li.addEventListener('click', () => {
    $('#mos-settings-modal').modal('show');

    setTimeout(() => {
      // this has to live here otherwise the clientHeight will be 0
      document.querySelector('#nonsense').style.top = `${document.querySelector('#nonsense').parentElement.clientHeight / 2 - 150}px`;
    }, 0);

    updateSettingsFields();
  });

  document.querySelector('#masthead-user-settings-link').insertAdjacentElement('afterend', li);
}

function checkSettingsStatus() {

  let changed = false;

  for (let el of document.querySelectorAll('.mos-settings-entry')) {
    if (el.type === 'checkbox') changed = el.checked !== window.MOS[el.dataset.key];
    else if (el.type === 'text') changed = el.value !== window.MOS[el.dataset.key];

    if (changed) break;
  }

  if (changed) {
    document.querySelector('#mos-settings-save').disabled = '';
    document.querySelector('#mos-settings-modal .modal-title').innerText = 'Script Config (Unsaved Changes)';
    document.querySelector('#mos-settings-modal .modal-header').classList.remove('bg-primary');
    document.querySelector('#mos-settings-modal .modal-header').style.background = 'gold';
    document.querySelector('#mos-settings-modal .modal-header').style.color = 'black';
  } else {
    document.querySelector('#mos-settings-save').disabled = 'true';
    document.querySelector('#mos-settings-modal .modal-title').innerText = 'Script Config';
    document.querySelector('#mos-settings-modal .modal-header').classList.add('bg-primary');
    document.querySelector('#mos-settings-modal .modal-header').style.background = '';
    document.querySelector('#mos-settings-modal .modal-header').style.color = '';
  }
}

function newVersionTooltip() {

  if (!window.MOS.version || window.MOS.version < VER) {
    window.MOS.version = VER;

    let el = document.createElement('div');
    el.id = 'script-update';
    el.style.position = 'absolute';
    el.innerHTML = `
    <div style="background-color: black; padding: 7px; width: 10px; transform: rotate(45deg); position: absolute; left: 28px ;top: -7px; z-index: 0; "></div>
    <div class="tooltip-inner" style="position: absolute; z-index: 1;">Script Update!</div>
    `;

    document.querySelector('#masthead-user-settings-link').parentElement.parentElement.appendChild(el);

    document.querySelector('#masthead-user-settings-link').parentElement.parentElement.addEventListener('click', () => {
      if (document.querySelector('#script-update')) {
        document.querySelector('#script-update').remove();
        saveSettingsToStorage();
      }
    });
  }
}

function updateDebug() {
  if (document.querySelector('#mos-settings-_debug').checked) document.querySelector('#nonsense').style.display = '';
  else document.querySelector('#nonsense').style.display = 'none';
}

function updateDarkMode() {
  console.log('updateDarkMode()', document.querySelector('#mos-settings-_darkMode').checked);
  if (document.querySelector('#mos-settings-_darkMode').checked) insertDarkMode();
  else if (document.querySelector('style#mos-dark-mode')) document.querySelector('style#mos-dark-mode').remove();
}

// ======== END SETTINGS ========

function pageView() {

  // if the page hasn't loaded yet, retry
  if (!document.querySelector('.page-path')) {
    setTimeout(pageView, RETRY_TIMEOUT);
    return;
  }
  // if the page has already been modified, return
  if (document.querySelector('#mos-dm-tag')) return;

  // adds the copyable dependency tag
  let dmTag = document.createElement('div');
  dmTag.id = 'mos-dm-tag';
  dmTag.classList.add('mos');
  dmTag.dataset['originalTitle'] = 'Click to Copy';
  dmTag.dataset['toggle'] = 'tooltip';
  dmTag.dataset['placement'] = 'bottom';
  dmTag.style['margin-left'] = '1em';
  dmTag.style.cursor = 'pointer';
  document.querySelector('.back-to-list-link').appendChild(dmTag);

  let filePath = document.querySelector('.page-path').title;

  $.ajax({
    type: 'GET',
    url: `https://a.cms.omniupdate.com/files/${filePath.includes('.pcf') ? 'products' : 'info'}`,
    data: {
      site: window.OU.app.attributes.site,
      path: document.querySelector('.page-path').innerText,
    },
  }).then(r => {

    let dm_tag = filePath.includes('.pcf') ? `{{${r[0].type}:${r[0].id}}}` : r.info.dm_tag;
    dmTag.innerText = dm_tag;

    dmTag.addEventListener('click', () => {
      copyToClipboard(dm_tag);
    });
  });

  // makes the file path copyable
  document.querySelector('.page-path').classList.add('mos');
  document.querySelector('.page-path').title = 'Click to Copy';
  document.querySelector('.page-path').dataset['originalTitle'] = 'Click to Copy';
  document.querySelector('.page-path').dataset['toggle'] = 'tooltip';
  document.querySelector('.page-path').dataset['placement'] = 'bottom';
  document.querySelector('.page-path').style.cursor = 'pointer';

  document.querySelector('.page-path').addEventListener('click', () => {
    copyToClipboard(filePath);
  });

  // refresh content window
  let refreshButton = document.createElement('button');
  refreshButton.id = 'mos-page-refresh';
  refreshButton.classList.add('btn', 'btn-round', 'btn-icon', 'mos');
  refreshButton.innerHTML = '<i class="icon-refresh"></i>'
  refreshButton.dataset['originalTitle'] = 'Refresh Content Window';
  refreshButton.dataset['toggle'] = 'tooltip';

  document.querySelector('.page-toolbar .actions').insertBefore(refreshButton, document.querySelector('#focus-mode-toggle'));

  // setting the src to itself refreshes the iframe
  refreshButton.addEventListener('click', () => document.querySelector('.content > iframe').src = document.querySelector('.content > iframe').src);

  // tooltips
  $('.mos[data-toggle="tooltip"]').tooltip();
}

function browseView() {

  // checks to see if all rows have been modified, and returns if they have
  if (document.querySelectorAll('[data-name="list-row-name"]').length === document.querySelectorAll('[data-name="list-row-name"][data-modified="true"]').length) return;
  let path = window.location.hash.match(/\/staging(.*)/i)[1];

  $.ajax({
    type: 'GET',
    url: 'https://a.cms.omniupdate.com/files/list',
    data: {
      site: window.OU.app.attributes.site,
      path: path.length === 0 ? '/' : path,
    },
  }).then(r => {

    for (let e of r.entries) {

      // console.log(e);

      if (document.querySelector(`[aria-label="${e.file_name}"]`)
        && !document.querySelector(`[aria-label="${e.file_name}"]`).dataset['modified']) {

        // prevents loop spam
        document.querySelector(`[aria-label="${e.file_name}"]`).dataset['modified'] = true;

        // Straight to source button
        if (window.MOS.sourceButtonInBrowse) {

          let sourceButton = document.createElement('a');
          sourceButton.classList.add('custom-dm-tag', 'mos');
          sourceButton.innerHTML = '<i class="icon-source" style="font-size: 25px; line-height: 50px;"></i>';
          sourceButton.dataset['originalTitle'] = 'Click to Edit Source';
          sourceButton.dataset['toggle'] = 'tooltip';
          sourceButton.style['max-width'] = 'min-content';
          sourceButton.style['text-decoration'] = 'none';
          sourceButton.style.cursor = 'pointer';
          sourceButton.href = document.querySelector(`[aria-label="${e.file_name}"]`).parentElement.parentElement.querySelector('[data-name="list-row-actions-item-source"]')
            ? document.querySelector(`[aria-label="${e.file_name}"]`).parentElement.parentElement.querySelector('[data-name="list-row-actions-item-source"]').href
            : '';

          // do it this way so there's a blank spacer
          if (!document.querySelector(`[aria-label="${e.file_name}"]`).parentElement.parentElement.querySelector('[data-name="list-row-actions-item-source"]')) sourceButton.style.visibility = 'hidden';

          document.querySelector(`[aria-label="${e.file_name}"]`).parentNode.appendChild(sourceButton);
        }

        // View Published Page in Browser
        if (window.MOS.viewPublishedPageInBrowse) {
          let publishedPageButton = document.createElement('a');
          publishedPageButton.classList.add('custom-dm-tag', 'mos');
          publishedPageButton.innerHTML = '<i class="icon-new-tab" style="font-size: 25px; line-height: 50px;"></i>';
          publishedPageButton.dataset['originalTitle'] = 'Click to Open in a New Tab';
          publishedPageButton.dataset['toggle'] = 'tooltip';
          publishedPageButton.style['max-width'] = 'min-content';
          publishedPageButton.style['text-decoration'] = 'none';
          publishedPageButton.style.cursor = 'pointer';
          publishedPageButton.target = '_blank';
          publishedPageButton.href = e.http_path.includes('.pcf') ? e.http_path.slice(0, -4) : e.http_path;

          // do it this way so there's a blank spacer
          if (e.file_type === 'dir') publishedPageButton.style.visibility = 'hidden';

          document.querySelector(`[aria-label="${e.file_name}"]`).parentNode.appendChild(publishedPageButton);
        }

        // Copy Dependency Tag
        if (window.MOS.copyDependencyTagInBrowse) {
          let dmTag = document.createElement('span');
          dmTag.classList.add('custom-dm-tag', 'mos');
          dmTag.innerHTML = '<i class="icon-tag" style="font-size: 25px; line-height: 50px;"></i>';
          dmTag.dataset['originalTitle'] = 'Click to Copy Dependency Tag';
          dmTag.dataset['toggle'] = 'tooltip';
          dmTag.style['max-width'] = 'min-content';
          dmTag.style.cursor = 'pointer';

          document.querySelector(`[aria-label="${e.file_name}"]`).parentNode.appendChild(dmTag);

          if (e.file_name.includes('.pcf')) {
            dmTag.addEventListener('click', () => {
              $.ajax({
                type: 'GET',
                url: 'https://a.cms.omniupdate.com/files/products',
                data: {
                  site: window.OU.app.attributes.site,
                  path: e.staging_path,
                },
              }).then(r => {
                copyToClipboard(`{{${r[0].type}:${r[0].id}}}`);
              });
            });
          } else {
            dmTag.addEventListener('click', () => {
              console.log(e.dm_tag);
              copyToClipboard(e.dm_tag);
            });
          }
        }

        // Copy Files Path
        let icon = document.querySelector(`[aria-label="${e.file_name}"]`).parentNode.parentNode.querySelector('.gridcell.rc-type.rc-center');

        icon.classList.add('mos');
        icon.dataset['originalTitle'] = 'Click to Copy File Path';
        icon.dataset['toggle'] = 'tooltip';
        icon.style.cursor = 'pointer';
        icon.addEventListener('click', () => {
          copyToClipboard(e.staging_path);
        });

      } else if (window.MOS._debug) console.log('This entry didn\'t work (or it was already present):', e);

      // view published page in dropdown
      if (window.MOS.viewPublishedPageInDropdown && e.file_type !== 'dir') {

        let http = e.http_path.includes('.pcf') ? e.http_path.slice(0, -4) : e.http_path;

        try {
          if (!document.querySelector(`[aria-label="${e.file_name}"]`).parentElement.parentElement.querySelector('.file-options-published-page'))
            document.querySelector(`[aria-label="${e.file_name}"]`).parentElement.parentElement.querySelector('.actions-dropdown .dropdown-toggle[data-name="list-row-actions-file"]').parentElement.querySelector('.dropdown-menu').innerHTML +=
              `<li><a target="_blank" class="file-options-published-page" href="${http}" tabindex="-1" role="menuitem" data-name="actions-published-page-link"><i class="icon-new-tab"></i> View Published Page</a></li>`;
        } catch (err) {
          if (window.MOS._debug) console.log('Couldn\'t append publish button for', e);
        }
      }

    }
    $('.mos[data-toggle="tooltip"]').tooltip();
  });

  // truncates "Unpublished" and "Unpublished Changes"
  if (window.MOS.truncateUnpublished) {
    for (let e of document.querySelectorAll('.unpublished-tag')) {
      e.classList.add('mos');
      e.dataset['toggle'] = 'tooltip';
      e.style.cursor = 'default';
      if (e.innerText === 'UNPUBLISHED') {
        e.innerText = 'U';
        e.dataset['originalTitle'] = 'Unpublished';
      } else if (e.innerText === 'UNPUBLISHED CHANGES') {
        e.innerText = 'UC';
        e.dataset['originalTitle'] = 'Unpublished Changes';
      }
    }

    for (let e of document.querySelectorAll('.unpublished-status.rc-220.rc-bp-125')) {
      e.style.flex = '0 0 30px';
    }
  }

  // tooltips
  $('.mos[data-toggle="tooltip"]').tooltip();
}

function assetView() {

  if (!document.querySelector('.page-path')) {
    setTimeout(pageView, RETRY_TIMEOUT);
    return;
  }

  let el = document.querySelector('.page-path');

  // TODO: change this check
  if (el.dataset.test) return;

  el.classList.add('mos');
  el.dataset.test = 'true';
  el.title = 'Click to Copy';
  el.dataset['originalTitle'] = 'Click to Copy';
  el.dataset['toggle'] = 'tooltip';
  el.dataset['placement'] = 'bottom';
  el.style.cursor = 'pointer';

  el.addEventListener('click', () => {
    copyToClipboard(el.innerText.match(/Dependency Tag: (.*)/i)[1]);
  });

  $('.mos[data-toggle="tooltip"]').tooltip();
}

function browseAssetsView() {

  if (document.querySelector('[data-name="list-row-dm-tag"]').dataset.test) return;

  for (let dmTag of document.querySelectorAll('[data-name="list-row-dm-tag"]')) {

    dmTag.classList.add('mos');
    dmTag.dataset['originalTitle'] = 'Click to Copy';
    dmTag.dataset['toggle'] = 'tooltip';
    dmTag.style.cursor = 'pointer';
    dmTag.dataset.test = 'true';

    dmTag.addEventListener('click', () => {
      copyToClipboard(dmTag.innerText);
    });
  }

  $('.mos[data-toggle="tooltip"]').tooltip();
}

/**
 * Done this way in case I want to add anything that happens on copy, such as a "Copied!" notification
 * @param str
 */
function copyToClipboard(str) {
  navigator.clipboard.writeText(str);
}

// ======== DARK MODE ========

function insertDarkMode() {
  if (document.querySelector('style#mos-dark-mode')) return;

  let el = document.createElement('style');
  el.id = 'mos-dark-mode';

  // yes I know it's a style tag inside a style tag, it's so that I get syntax highlighting in PHPStorm :P
  el.innerHTML += `
/*<style>*/
:root {
 --primary-white:#141414; /*fff*/
 --primary-white-8:hsla(0,0%,15%,0.8); /*hsla(0,0%,100%,0.8)*/
 --primary-white-shadow-2:0 0 0 2px var(--primary-white);
 --primary-white-shadow-2-inset:inset var(--primary-white-shadow-2);
 --primary-white-1-px:1px solid var(--primary-white);
 --primary-white-2-px:2px solid var(--primary-white);
 --primary-white-6-px:6px solid var(--primary-white);
 --primary-gray-100:#1e1e1e; /*fcfcfc*/
 --primary-gray-150:#232323; /*f7f7f7*/
 --primary-gray-200:#282828; /*f2f2f2*/
 --primary-gray-250:#2d2d2d; /*ededed*/
 --primary-gray-300:#323232; /*e8e8e8*/
 --primary-gray-350:#373737; /*e3e3e3*/
 --primary-gray-400:#3c3c3c; /*e0e0e0*/
 --primary-gray-450:#414141; /*dedede*/
 --primary-gray-500:#464646; /*ccc*/
 --primary-gray-550:#4b4b4b; /*c2c2c2*/
 --primary-gray-600:#505050; /*bababa*/
 --primary-gray-625-5:hsla(0,0%,10%,0.5); /*hsla(0,0%,65%,0.5);*/
 --primary-gray-650:#555555; /*878787*/
 --primary-gray-700:#5a5a5a; /*757575*/
 --primary-gray-750:#969696; /*575757*/
 --primary-gray-750-4:rgba(87,87,87,0.2); /*rgba(87,87,87,0.4)*/
 --primary-gray-800:#c8c8c8; /*404040*/
 --primary-gray-300-shadow-2:0 0 0 2px var(--primary-gray-300);
 --primary-gray-550-shadow-2:0 0 0 2px var(--primary-gray-550);
 --primary-gray-550-shadow-2-inset:inset var(--primary-gray-550-shadow-2);
 --primary-gray-400-1-px:1px solid var(--primary-gray-400);
 --primary-gray-400-2-px:2px solid var(--primary-gray-400);
 --primary-gray-400-3-px:3px solid var(--primary-gray-400);
 --primary-gray-600-1-px:1px solid var(--primary-gray-600);
 --primary-gray-600-1-px-dashed:1px dashed var(--primary-gray-600);
 --primary-gray-650-2-px:2px solid var(--primary-gray-650);
 --primary-gray-800-1-px:1px solid var(--primary-gray-800);
 --primary-black:#000; /*000*/
 --primary-black-05:rgba(10,10,10,0.6); /*rgba(0,0,0,0.05)*/
 --primary-black-12:rgba(20,20,20,0.7); /*rgba(0,0,0,0.12)*/
 --primary-black-5:rgba(30,30,30,0.8); /*rgba(0,0,0,0.5)*/
 --primary-black-shadow-2:0 0 0 2px var(--primary-black);
 --primary-black-shadow-2-inset:inset var(--primary-black-shadow-2);
 --primary-black-shadow-4:0 0 4px var(--primary-black);
 --primary-black-2-px:2px solid var(--primary-black);
 --primary-blue-100:#15333e; /*f3f9fb*/
 --primary-blue-150:#1e4a5b; /*e4f1f6*/
 --primary-blue-200:#089ad9; /*089ad9*/
 --primary-blue-250:#48a0cb; /*48a0cb*/
 --primary-blue-300:#006da3; /*006da3*/
 --primary-blue-400:#0077b3; /*0077b3*/
 --primary-blue-500:#08c; /*08c*/
 --primary-blue-550:#0077b8; /*0077b8*/
 --primary-blue-600:#0065ad; /*0065ad*/
 --primary-blue-700:#23527b; /*23527b*/
 --primary-blue-800:#5bafec; /*5bafec*/
 --primary-blue-800-3:rgba(91,175,236,0.3); /**/
 --primary-blue-250-shadow-2:0 0 0 2px var(--primary-blue-250);
 --primary-blue-250-shadow-2-inset:inset var(--primary-blue-250-shadow-2);
 --primary-blue-550-shadow-2:0 0 0 2px var(--primary-blue-550);
 --primary-blue-550-shadow-2-inset:inset var(--primary-blue-550-shadow-2);
 --primary-blue-250-2-px:2px solid var(--primary-blue-250);
 --primary-blue-300-1-px:1px solid var(--primary-blue-300);
 --primary-blue-400-2-px:2px solid var(--primary-blue-400);
 --primary-blue-400-2-px-dashed:2px dashed var(--primary-blue-400);
 --primary-blue-400-4-px-dashed:4px dashed var(--primary-blue-400);
 --primary-blue-550-1-px:1px solid var(--primary-blue-550);
 --primary-blue-700-2-px:2px solid var(--primary-blue-700);
 --primary-blue-700-4-px:4px solid var(--primary-blue-700);
 --primary-dark-blue-100:#2d3947; /*e6eaef*/
 --primary-dark-blue-200:#343e4d; /*cbd2dc*/
 --primary-dark-blue-300:#425163; /*9aa9bc*/
 --primary-dark-blue-400:#4e5f76; /*667c99*/
 --primary-dark-blue-500:#325176; /*325176*/
 --primary-dark-blue-600:#667c99; /*002352*/
 --primary-dark-blue-400-shadow-2:0 0 0 2px var(--primary-dark-blue-400);
 --primary-dark-blue-400-shadow-2-inset:inset var(--primary-dark-blue-400-shadow-2);
 --primary-dark-blue-400-2-px:2px solid var(--primary-dark-blue-400);
 --primary-dark-blue-500-2-px-dashed:2px dashed var(--primary-dark-blue-500);
 --primary-dark-blue-500-1-px:1px solid var(--primary-dark-blue-500);
 --primary-dark-blue-500-2-px:2px solid var(--primary-dark-blue-500);
 --primary-dark-blue-500-6-px:6px solid var(--primary-dark-blue-500);
 --primary-green-100:#cbe7cc; /**/
 --primary-green-200:#3c773d; /**/
 --primary-green-300:#006b05; /**/
 --primary-green-400:#007508; /**/
 --primary-green-500:#008a09; /**/
 --primary-green-200-1-px:1px solid var(--primary-green-200);
 --primary-green-200-2-px:2px solid var(--primary-green-200);
 --primary-green-200-2-px-dashed:2px dashed var(--primary-green-200);
 --primary-green-400-1-px:1px solid var(--primary-green-400);
 --primary-green-500-1-px:1px solid var(--primary-green-500);
 --primary-teal-100:#e4f4f6; /**/
 --primary-teal-200:#cdebee; /**/
 --primary-teal-300:#98d5dd; /**/
 --primary-teal-400:#67c1cb; /**/
 --primary-teal-500:#32abb8; /**/
 --primary-teal-600:#0097a8; /**/
 --primary-dark-teal-100:#e6efef; /**/
 --primary-dark-teal-200:#cde0e0; /**/
 --primary-dark-teal-300:#98bdbd; /**/
 --primary-dark-teal-400:#679e9e; /**/
 --primary-dark-teal-500:#347f7d; /**/
 --primary-dark-teal-600:#005c5a; /**/
 --primary-tan-100:#fdfaf7; /**/
 --primary-tan-200:#faf5f0; /**/
 --primary-tan-300:#f5ebe0; /**/
 --primary-tan-400:#f2e3d4; /**/
 --primary-tan-500:#ecd9c5; /**/
 --primary-tan-600:#e7cfb6; /**/
 --primary-yellow-100:#1e1a02; /*fefbec*/
 --primary-yellow-200:#302a03; /*fdf8d8*/
 --primary-yellow-300:#7a6907; /*fbf0b1*/
 --primary-yellow-400:#a08909; /*f8ea8b*/
 --primary-yellow-500:#c5a90b; /*f6e065*/
 --primary-yellow-600:#f4d93e; /*f4d93e*/
 --primary-dark-orange-100:#faedea; /**/
 --primary-dark-orange-200:#f6dad5; /**/
 --primary-dark-orange-300:#edb2a6; /**/
 --primary-dark-orange-400:#e38e7d; /**/
 --primary-dark-orange-500:#da654e; /**/
 --primary-dark-orange-600:#d14023; /**/
 --primary-dark-orange-600-shadow-2:0 0 0 2px var(--primary-dark-orange-600);
 --primary-dark-orange-600-shadow-2-inset:inset var(--primary-dark-orange-600-shadow-2);
 --primary-orange-100:#240700; /*ffeeeb*/
 --primary-orange-200:#4c0e00; /*ffded6*/
 --primary-orange-300:#731500; /*ffc1b3*/
 --primary-orange-400:#9a1d00; /*ff9f8a*/
 --primary-orange-500:#d52800; /*ff7e61*/
 --primary-orange-600:#ff5d38; /*ff5d38*/
 --primary-orange-600-shadow-2:0 0 0 2px var(--primary-orange-600);
 --primary-orange-600-shadow-3:0 0 0 3px var(--primary-orange-600);
 --primary-orange-600-shadow-3-inset:inset var(--primary-orange-600-shadow-3);
 --primary-orange-500-2-px:2px solid var(--primary-orange-500);
 --primary-orange-500-3-px:3px solid var(--primary-orange-500);
 --primary-orange-600-1-px:1px solid var(--primary-orange-600);
 --primary-orange-600-2-px:2px solid var(--primary-orange-600);
 --primary-orange-600-3-px:3px solid var(--primary-orange-600);
 --primary-red-100:#220506; /*fff0f0*/
 --primary-red-150:#430b0c; /*fdcece*/
 --primary-red-200:#651012; /*eecfce*/
 --primary-red-250:#871519; /*ffe5e9*/
 --primary-red-300:#b94846; /**/
 --primary-red-400:#a94342; /**/
 --primary-red-500:#a21b16; /**/
 --primary-red-550:#b41e18; /**/
 --primary-red-600:#d14023; /**/
 --primary-red-700:#be301e; /**/
 --primary-red-800:#cb2025; /**/
 --primary-red-550-shadow-2:0 0 0 2px var(--primary-red-550);
 --primary-red-250-1-px:1px solid var(--primary-red-250);
 --primary-red-550-1-px:1px solid var(--primary-red-550);
 --primary-red-550-2-px:2px solid var(--primary-red-550);
 --primary-dashboard-backdrop:#191510; /**/
 --primary-logo-color:#00449f; /*002352*/
 --secondary-logo-color:#ff5d38; /**/
 --primary-folder-color:#fdc82b; /**/
 --primary-folder-outline:#d9a302; /**/
 --primary-folder-outline-shadow:-1px 0 var(--primary-folder-outline),0 1px var(--primary-folder-outline),1px 0 var(--primary-folder-outline),0 -1px var(--primary-folder-outline);
 --primary-bulb-color:var(--primary-yellow-600);
 --primary-bulb-outline:var(--primary-gray-750);
 --primary-bulb-outline-shadow:-1px 0 var(--primary-bulb-outline),0 1px var(--primary-bulb-outline),1px 0 var(--primary-bulb-outline),0 -1px var(--primary-bulb-outline),0 0 5px var(--primary-bulb-color);
 --primary-shadow-color:hsla(180,7%,8%,0.8); /*hsla(200,7%,82%,0.6)*/
 --primary-shadow:0 2px 6px 0 var(--primary-shadow-color);
 --primary-shadow-left-nav:0 2px 9px 2px var(--primary-shadow-color);
 --primary-shadow-right:4px 0 4px -2px var(--primary-shadow-color);
 --primary-shadow-bottom:0 1px 2px 1px var(--primary-shadow-color);
 --primary-around-black-shadow:0 2px 4px 0 var(--primary-black-5);
 --primary-around-black-shadow-hover:4px 2px 10px 1px var(--primary-black-5);
 --primary-btn-box-shadow:0 0 2px 0 var(--primary-black-12),0 2px 2px 0 var(--primary-black-12),0 0 8px 0 var(--primary-black-12);
 --primary-shadow-aside-buttons:0 0 8px 0 var(--primary-black-12),0 8px 8px 0 var(--primary-black-12);
 --primary-regular-shadow:0 2px 9px 2px var(--primary-gray-625-5);
 --primary-btn-drop-shadow:inset 0 2px 4px var(--primary-black-12),inset 0 1px 2px var(--primary-black-05);
 --list-actions:#2d2d2d; /*f0f2f5*/
 --list-actions-hover:#2d3947; /*e6eaef*/ /* this matches --primary-dark-blue-100 */
 --list-actions-select:#02547e; /*02547e*/
 --list-sorters:#232323; /*f7f7f7*/
 --list-sorters-hover:#282828; /*f2f2f2*/
 --list-sorters-selected:#323232; /*e8e8e8*/
 --list-row-hover:#232323; /*f7f7f7*/
 --list-row-hover-actions:#323232; /*e8e8e8*/
 --list-row-hover-actions-btn:#414141; /*dedede*/
 --list-row-selected:#2d2d2d; /*f0f2f5*/
 --list-row-selected-hover:#2d3947; /*e6eaef*/ /* this matches --primary-dark-blue-100 */
 --list-row-selected-actions-btn:#464646; /*d1d8e1*/
 --list-row-border:1px solid #3c3c3c; /*e0e0e0*/
 --list-row-actions-gradient:linear-gradient(to right,rgba(0,0,0,0.001) 0%,var(--primary-white) 100%);
 --list-row-details-shadow:0 -2px 4px 0 var(--primary-shadow-color)
}

:root {
 --fc-border-color:var(--primary-gray-500);
 --fc-today-bg-color:var(--primary-white);
 --fc-event-border-color:#ff65e5;
 --fc-event-bg-color:#ff65e5;
 --fc-event-text-color:#000000; /*fff*/
 --fc-event-cancelled-bg-color:var(--primary-white);
 --fc-event-cancelled-text-color:var(--primary-red-550);
 --fc-event-cancelled-border-color:var(--primary-red-550);
 --fc-button-text-color:var(--primary-black);
 --fc-button-bg-color:var(--primary-white);
 --fc-button-border-color:var(--primary-blue-700);
 --fc-button-active-text-color:#000000; /*fff*/
 --fc-button-active-bg-color:var(--primary-blue-700);
 --fc-button-hover-text-color:#000000; /*fff*/
 --fc-button-hover-bg-color:var(--primary-blue-300);
 --fc-button-hover-border-color:var(--primary-blue-300);
 --fc-month-heading-bg-color:var(--primary-gray-150);
 --fc-month-other-days-bg-color:#040201; /*fbfdfe*/
 --fc-month-days-bg-color:var(--primary-white);
 --fc-toolbar-heading-text-color:var(--primary-blue-700);
 --fc-day-number-color:#fff; /*000*/
 --fc-today-date-bg-color:var(--primary-blue-700);
 --fc-today-date-text-color:#000; /*fff*/
 --fc-today-bg-color:transparent;
 --fc-today-border:2px solid var(--primary-blue-300)
}

/* TODO: this it might need to be manually added inside of the iframe to work */
.gadget-dashboard-heading .icon-img {
  filter: invert(100%);
}

.modal-content {
  background-color: var(--primary-gray-250);
}

.btn, .btn:hover, #toast-container > div {
  color: var(--primary-gray-800);
}

#cms-inline-editor-id .ou-justedit-toolbar-cntr, .ou-justedit-toolbar-cntr {
  filter: invert(100%);
}

.select2-drop, .select2-drop-mask, .select2-container .select2-choice {
  background-color: var(--primary-gray-250);
  color: var(--primary-gray-800);
}

.select2-container-multi ul.select2-choices {
  background-color: var(--primary-gray-100);
}

#progress-message .loading-spinner {
  filter: invert(100%);
}

/*</style>*/
`;

  // let last;
  //
  // for (let e of document.querySelectorAll('head link[rel="stylesheet"]')) {
  //   last = e;
  // }

  // document.querySelector('head').insertBefore(el, last);
  document.querySelector('body').appendChild(el);
}
