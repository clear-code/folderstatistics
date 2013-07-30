/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var FolderStatistics = {
  domain: 'extensions.folderstatistics@clear-code.com.',

  get Prefs() {
    if (!this._Prefs) {
      let ns = {};
      Components.utils.import('resource://folderstatistics-modules/prefs.js', ns);
      this._Prefs = ns.prefs;
    }
    return this._Prefs
  },
  _Prefs: null,

  get TextIO() {
    if (!this._TextIO) {
      let ns = {};
      Components.utils.import('resource://folderstatistics-modules/textIO.jsm', ns);
      this._TextIO = ns.textIO;
    }
    return this._TextIO
  },
  _TextIO: null,

  get bundle() {
    if (!this._bundle) {
      let ns = {};
      Components.utils.import('resource://folderstatistics-modules/stringBundle.js', ns);
      this._bundle = ns.stringBundle.get('chrome://folderstatistics/locale/messages.properties');
    }
    return this._bundle
  },
  _bundle: null,

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

    var self = this;
    this.asyncPickSaveFile(
      this.bundle.getString('picker.title.csv'),
      this.bundle.getFormattedString('picker.default.csv', [server.rootFolder.prettyName]),
      function(aFile) {
        if (!aFile)
          return;
        try {
          var statistics = self.getFoldersStatistics(server.rootFolder.subFolders);
          var linefeed = self.Prefs.getPref(self.domain + 'CSV.linefeed');
          var encoding = self.Prefs.getPref(self.domain + 'CSV.encoding');
          var csv = self.toCSV(statistics, linefeed);
          self.TextIO.writeTo(csv, aFile, encoding);
          alert(self.bundle.getFormattedString('picker.report.csv', [server.rootFolder.prettyName, aFile.path]));
        }
        catch(error) {
          Components.utils.reportError(error);
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
        accountsArray.push(accounts.GetElementAt(i));
      }
    } else if (accounts instanceof Ci.nsIArray) {
      for (let i = 0, maxi = accounts.length; i < maxi; i++) {
        accountsArray.push(accounts.queryElementAt(i));
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

  getFoldersStatistics: function FolderStatistics_getFoldersStatistics(aFolders, aParent) {
    var foldersArray = [];
    while (aFolders.hasMoreElements()) {
      let folder = aFolders.getNext().QueryInterface(Ci.nsIMsgFolder);
      foldersArray.push(this.getFolderStatistics(folder, aParent));
    }
    return foldersArray;
  },
  getFolderStatistics: function FolderStatistics_getFolderStatistics(aFolder, aParent) {
    var item = {
      name:     aFolder.prettyName,
      fullName: (aParent ? aParent + '/' : '') + aFolder.prettyName,
      count:    aFolder.getTotalMessages(false),
      size:     aFolder.sizeOnDisk // bytes
    };
    var children = this.getFoldersStatistics(aFolder.subFolders, item.fullName);
    if (children.length > 0)
      item.children = children;
    return item;
  },

  toCSV: function FolderStatistics_toCSV(aItems, aLinefeed) {
    var rows = []
    aItems.forEach(function(aItem) {
      rows = rows.concat(this.itemToRows(aItem));
    }, this);
    return rows.map(function(aRow) {
      return aRow.map(this.escapeStringForCSV).join(',');
    }, this).sort().join(aLinefeed || '\n');
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
