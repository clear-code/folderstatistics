/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var FolderStatistics = {
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
    var statistics = this.getStatistics(server.rootFolder);
    var csv = this.toCSV(statistics);
    alert(csv);
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

  getStatistics: function FolderStatistics_getStatistics(aFolder, aParent) {
    var results = [];
    var item = {
      name:     aFolder.prettyName,
      fullName: (aParent ? aParent + '/' : '') + aFolder.prettyName,
      count:    aFolder.getTotalMessages(false),
      size:     aFolder.sizeOnDisk // bytes
    };
    var children = [];
    var subFolders = aFolder.subFolders;
    while (subFolders.hasMoreElements()) {
      let subFolder = subFolders.getNext().QueryInterface(Ci.nsIMsgFolder);
      children.push(this.getStatistics(subFolder, item.fullName));
    }
    if (children.length > 0)
      item.children = children;
    return item;
  },

  toCSV: function FolderStatistics_toCSV(aStatistics) {
    var rows = this.itemToRows(aStatistics);
    return rows.map(function(aRow) {
      return aRow.map(this.escapeStringForCSV).join(',');
    }, this).join(this.CSV_LINE_FEED);
  },
  escapeStringForCSV: function FolderStatistics_escapeStringForCSV(aValue) {
    if (typeof aValue == 'string')
      return '"' + aValue.replace(/"/g, '""') + '"';
    else
      return aValue;
  },
  CSV_LINE_FEED: '\r\n',

  itemToRows: function FolderStatistics_itemToRows(aItem) {
    var rows = [];
    rows.push([aItem.fullName, Math.max(aItem.count, 0), aItem.size]);
    if (aItem.children) {
      aItem.children.forEach(function(aChild) {
        rows = rows.concat(this.itemToRows(aChild));
      }, this);
    }
    return rows;
  }
};
