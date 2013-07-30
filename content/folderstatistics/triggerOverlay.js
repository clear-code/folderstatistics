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
    var result = this.getSizes(server.rootFolder);
    alert(item.value + '\n' + result);
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
    this.allAccounts.some(function(account) {
      account = account.QueryInterface(Ci.nsIMsgAccount);
      var server = account.incomingServer;
      if (server.key == aKey)
        return foundServer = server;
    }, this);
    return foundServer;
  },

  getSizes: function FolderStatistics_getSizes(aFolder, aIndent) {
    aIndent = (aIndent === undefined) ? '' : (aIndent + '  ');
    var results = [];
    results.push(aFolder.prettyName + ' / ' + aFolder.getTotalMessages(false) + ' messages / ' +  aFolder.sizeOnDisk + ' bytes');
    var subFolders = aFolder.subFolders;
    while (subFolders.hasMoreElements()) {
      let subFolder = subFolders.getNext().QueryInterface(Ci.nsIMsgFolder);
      results.push(getSizes(subFolder, aIndent));
    }
    return results.map(function(line) {
      return line.replace(/^/g, aIndent);
    }).join('\n');
  }
};
