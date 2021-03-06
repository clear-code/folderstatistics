/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var FolderStatistics = {
  domain: 'extensions.folderstatistics@clear-code.com.',

  get Prefs() {
    delete this.Prefs;
    let ns = {};
    Components.utils.import('resource://folderstatistics-modules/prefs.js', ns);
    return this.Prefs = ns.prefs;
  },

  get TextIO() {
    delete this.TextIO;
    let ns = {};
    Components.utils.import('resource://folderstatistics-modules/textIO.jsm', ns);
    return this.TextIO = ns.textIO;
  },

  get PromptService() {
    delete this.PromptService;
    return this.PromptService = Components.classes['@mozilla.org/embedcomp/prompt-service;1']
                                  .getService(Components.interfaces.nsIPromptService);
  },
  alert: function FolderStatistics_alert(aTitle, aMessage) {
    this.PromptService.alert(window, aTitle, aMessage);
  },

  get bundle() {
    delete this.bundle;
    let ns = {};
    Components.utils.import('resource://folderstatistics-modules/stringBundle.js', ns);
    return this.bundle = ns.stringBundle.get('chrome://folderstatistics/locale/messages.properties');
  },

  onPopupShowing: function FolderStatistics_onPopupShowing(aEvent) {
    var popup = aEvent.currentTarget;

    this.allAccounts.forEach(function(aAccount) {
      aAccount = aAccount.QueryInterface(Ci.nsIMsgAccount);
      var server = aAccount.incomingServer;
      var type = server.type;
      if (!/^(pop3|imap|none)$/.test(type))
        return;
      try {
        var item = document.createElement('menuitem');
        item.setAttribute('label', server.prettyName);
        item.setAttribute('value', server.key);
        item.setAttribute('data-server-type', server.type);
        popup.appendChild(item);
      }
      catch(error) {
        Components.utils.reportError(error);
      }
    }, this);
  },

  onPopupHiding: function FolderStatistics_onPopupHiding(aEvent) {
    var popup = aEvent.currentTarget;
    var range = document.createRange();
    range.selectNodeContents(popup);
    range.deleteContents();
    range.detach();
  },

  onCommand: function FolderStatistics_onCommand(aEvent) {
    var item = aEvent.target;
    var server = this.getServer(item.value);
    var type = item.getAttribute('data-server-type');

    var now = new Date();
    var fileName = this.Prefs.getLocalizedPref(this.domain + 'defaultFileName');
    fileName = fileName
      .replace(/\%account/gi, server.rootFolder.prettyName)
      .replace(/\%yyyy/gi, now.getFullYear())
      .replace(/\%mm/gi, ('0' + (now.getMonth() + 1)).slice(-2))
      .replace(/\%dd/gi, ('0' + now.getDate()).slice(-2));

    var defaultExtension = '.csv';

    var self = this;

    var outputStatistics = function(aFile) {
        try {
          var sizeNotation = self.Prefs.getPref(self.domain + 'CSV.sizeNotation');
          var statistics = self.getFoldersStatistics(server.rootFolder.subFolders, null, sizeNotation);
          var linefeed = self.Prefs.getPref(self.domain + 'CSV.linefeed');
          var header   = self.Prefs.getPref(self.domain + 'CSV.header');
          var encoding = self.Prefs.getPref(self.domain + 'CSV.encoding');
          var csv = self.toCSV(statistics, {
                linefeed:     linefeed,
                header:       header,
                sizeNotation: sizeNotation
              });
          self.TextIO.writeTo(csv, aFile, encoding);
          self.alert(self.bundle.getString('picker.report.title'),
                     self.bundle.getFormattedString('picker.report.csv', [server.rootFolder.prettyName, aFile.path]));
        }
        catch(error) {
          Components.utils.reportError(error);
        }
    };

    this.asyncPickSaveFile(
      this.bundle.getString('picker.title.csv'),
      fileName + defaultExtension,
      function(aFile) {
        if (!aFile)
          return;

        if (!/\.[a-z0-9]+$/i.test(aFile.leafName) &&
            self.Prefs.getPref(self.domain + 'addDefaultExtension'))
          aFile.initWithPath(aFile.path.replace(/\.$/, '') + defaultExtension);

        if (type == 'imap') {
          var messageWindow = openDialog(
            'chrome://folderstatistics/content/updating.xul',
            '_blank',
            'chrome,dialog=no,centerscreen=yes,dependent=yes,minimizable=no,' +
              'fullscreen=no,titlebar=no,alwaysRaised=yes,close=no'
          );
          var updatingStatus = self.updateAllFolders(server.rootFolder);
          setTimeout(function checkStatus() {
            // Components.utils.reportError('updating:\n'+self.lastUpdatingFolderListeners.map(function(aListener) { return aListener.folder.name + ' (' + aListener.folder.URI + ')'; }).join('\n'));
            try {
              var progress = updatingStatus.next();
              var bar = messageWindow.document.getElementById('progressbar');
              if (bar)
                bar.value = progress;
              if (progress < 100)
                return setTimeout(checkStatus, 250);
              messageWindow.close();
              outputStatistics(aFile);
            } catch(aException) {
              Components.utils.reportError(aException);
              messageWindow.close();
            }
          }, 0);
        } else {
          outputStatistics(aFile);
        }
      }
    );
  },

  get allAccounts() {
    var accountManager = Cc['@mozilla.org/messenger/account-manager;1'].getService(Ci.nsIMsgAccountManager);
    var accounts = accountManager.accounts;
    var accountsArray = [];
    if (accounts instanceof Ci.nsISupportsArray) {
      for (let i = 0, maxi = accounts.Count(); i < maxi; i++) {
        accountsArray.push(accounts.GetElementAt(i).QueryInterface(Ci.nsIMsgAccount));
      }
    } else if (accounts instanceof Ci.nsIArray) {
      for (let i = 0, maxi = accounts.length; i < maxi; i++) {
        accountsArray.push(accounts.queryElementAt(i, Ci.nsIMsgAccount));
      }
    }
    return accountsArray;
  },

  getServer: function FolderStatistics_getServer(aKey) {
    var foundServer;
    this.allAccounts.some(function(aAccount) {
      aAccount = aAccount.QueryInterface(Ci.nsIMsgAccount);
      var server = aAccount.incomingServer;
      if (server.key == aKey)
        return foundServer = server;
    }, this);
    return foundServer;
  },

  SIZE_NOTATION_AUTO:   0,
  SIZE_NOTATION_BYTES:  1 << 0,
  SIZE_NOTATION_KBYTES: 1 << 1,

  updateAllFolders: function FolderStatistics_updateAllFolders(aRootFolder) {
    var updatingFolders = [];
    if ('descendants' in aRootFolder) { // Thunderbird 24
      let folders = aRootFolder.descendants;
      for (let i = 0, maxi = folders.length; i < maxi; i++) {
        updatingFolders.push(folders.queryElementAt(i, Ci.nsIMsgFolder));
      }
    } else { // Thunderbird 17 or olders
      let folders = Cc['@mozilla.org/supports-array;1']
                      .createInstance(Ci.nsISupportsArray);
      aRootFolder.ListDescendents(folders);
      for (let i = 0, maxi = folders.Count(); i < maxi; i++) {
        updatingFolders.push(folders.GetElementAt(i).QueryInterface(Ci.nsIMsgFolder));
      }
    }
    var listeners = updatingFolders.map(function(aFolder) {
      aFolder.QueryInterface(Ci.nsIMsgImapMailFolder);
      if (aFolder.noSelect)
        return null;
      var listener = this.createURLListenerForFolder(aFolder);
      aFolder.updateFolderWithListener(msgWindow, listener);
      return listener;
    }, this);

    this.lastUpdatingFolderListeners = listeners;
    var total = listeners.length || 1;
    return (function() {
      while (listeners.length) {
        listeners = listeners.filter(function(aListener) {
          return aListener && !aListener.finished;
        });
        this.lastUpdatingFolderListeners = listeners;
        yield Math.round((total - listeners.length) / total * 100);
      }
      yield 100;
    }).call(this);
  },
  createURLListenerForFolder: function FolderStatistics_createURLListenerForFolder(aFolder) {
    return {
      OnStartRunningUrl: function OnStartRunningUrl(aURL) {
      },
      OnStopRunningUrl: function OnStopRunningUrl(aURL, aExitCode) {
        this.finished = true;
      },
      folder: aFolder,
      finished: false
    };
  },

  getFoldersStatistics: function FolderStatistics_getFoldersStatistics(aFolders, aParent, aSizeNotation) {
    var foldersArray = [];
    while (aFolders.hasMoreElements()) {
      let folder = aFolders.getNext().QueryInterface(Ci.nsIMsgFolder);
      foldersArray.push(this.getFolderStatistics(folder, aParent, aSizeNotation));
    }
    return foldersArray;
  },
  getFolderStatistics: function FolderStatistics_getFolderStatistics(aFolder, aParent, aSizeNotation) {
    var size = aFolder.sizeOnDisk; // bytes
    if (aSizeNotation == this.SIZE_NOTATION_KBYTES) {
      size = Math.round(size / 1024);
    }
    var item = {
      name:     aFolder.prettyName,
      fullName: (aParent ? aParent + '/' : '') + aFolder.prettyName,
      count:    aFolder.getTotalMessages(false),
      size:     size
    };
    var children = this.getFoldersStatistics(aFolder.subFolders, item.fullName, aSizeNotation);
    if (children.length > 0)
      item.children = children;
    return item;
  },

  toCSV: function FolderStatistics_toCSV(aItems, aOptions) {
    aOptions = aOptions || {};

    var rows = [];
    aItems.forEach(function(aItem) {
      rows = rows.concat(this.itemToRows(aItem));
    }, this);
    rows = rows.map(function(aRow) {
      return aRow.map(this.escapeStringForCSV).join(',');
    }, this).sort();

    if (aOptions.header) {
      let sizeLabel = this.bundle.getString('header.size');
      switch (aOptions.sizeNotation) {
        case this.SIZE_NOTATION_BYTES:
          sizeLabel += ' (bytes)';
          break;
        case this.SIZE_NOTATION_KBYTES:
          sizeLabel += ' (kbytes)';
          break;
        default:
          break;
      }
      rows.unshift([
        this.bundle.getString('header.folder'),
        this.bundle.getString('header.count'),
        sizeLabel
      ].map(this.escapeStringForCSV));
    }

    return rows.join(aOptions.linefeed || aOptions.lineFeed || '\n');
  },
  escapeStringForCSV: function FolderStatistics_escapeStringForCSV(aValue) {
    if (typeof aValue == 'string')
      return '"' + aValue.replace(/"/g, '""') + '"';
    else
      return aValue;
  },

  itemToRows: function FolderStatistics_itemToRows(aItem) {
    var rows = [];
    rows.push([aItem.fullName, Math.max(aItem.count, 0), aItem.size]);
    if (aItem.children) {
      aItem.children.forEach(function(aChild) {
        rows = rows.concat(this.itemToRows(aChild));
      }, this);
    }
    return rows;
  },

  asyncPickSaveFile: function FolderStatistics_asyncPickSaveFile(aTitle, aDefaultFileName, aCallback) {
    var filePicker = Cc['@mozilla.org/filepicker;1']
        .createInstance(Ci.nsIFilePicker);

    filePicker.init(
      window,
      aTitle,
      filePicker.modeSave
    );
    if (aDefaultFileName)
      filePicker.defaultString = aDefaultFileName;

    var handleResult = function(aResult) {
      var picked;
      if (aResult == filePicker.returnOK || aResult == filePicker.returnReplace) {
        picked = filePicker.file.QueryInterface(Ci.nsILocalFile);
      }
      else {
        picked = null;
      }
      aCallback(picked);
    };

    if (typeof filePicker.open != 'function') { // Gecko 18 and olders
      setTimeout(function() {
        handleResult(filePicker.show());
      }, 0);
    }
    else {
      filePicker.open({ done: handleResult });
    }
  }
};
