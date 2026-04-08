export const HA_VAULT_READER_ABI = 
[
   {
      "inputs":[
         
      ],
      "stateMutability":"nonpayable",
      "type":"constructor"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"target",
            "type":"address"
         }
      ],
      "name":"AddressEmptyCode",
      "type":"error"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"implementation",
            "type":"address"
         }
      ],
      "name":"ERC1967InvalidImplementation",
      "type":"error"
   },
   {
      "inputs":[
         
      ],
      "name":"ERC1967NonPayable",
      "type":"error"
   },
   {
      "inputs":[
         
      ],
      "name":"FailedCall",
      "type":"error"
   },
   {
      "inputs":[
         
      ],
      "name":"InvalidInitialization",
      "type":"error"
   },
   {
      "inputs":[
         
      ],
      "name":"NotInitializing",
      "type":"error"
   },
   {
      "inputs":[
         
      ],
      "name":"UUPSUnauthorizedCallContext",
      "type":"error"
   },
   {
      "inputs":[
         {
            "internalType":"bytes32",
            "name":"slot",
            "type":"bytes32"
         }
      ],
      "name":"UUPSUnsupportedProxiableUUID",
      "type":"error"
   },
   {
      "inputs":[
         
      ],
      "name":"Unauthorized",
      "type":"error"
   },
   {
      "inputs":[
         
      ],
      "name":"ZeroAddress",
      "type":"error"
   },
   {
      "anonymous":false,
      "inputs":[
         {
            "indexed":false,
            "internalType":"uint64",
            "name":"version",
            "type":"uint64"
         }
      ],
      "name":"Initialized",
      "type":"event"
   },
   {
      "anonymous":false,
      "inputs":[
         {
            "indexed":true,
            "internalType":"address",
            "name":"implementation",
            "type":"address"
         }
      ],
      "name":"Upgraded",
      "type":"event"
   },
   {
      "inputs":[
         
      ],
      "name":"UPGRADER_ROLE",
      "outputs":[
         {
            "internalType":"bytes32",
            "name":"",
            "type":"bytes32"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"UPGRADE_INTERFACE_VERSION",
      "outputs":[
         {
            "internalType":"string",
            "name":"",
            "type":"string"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"uint256",
            "name":"targetTimestamp",
            "type":"uint256"
         }
      ],
      "name":"findFirstRedeemIdAfter",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getAccessManager",
      "outputs":[
         {
            "internalType":"address",
            "name":"",
            "type":"address"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getAllAssetNavs",
      "outputs":[
         {
            "internalType":"address[]",
            "name":"assets",
            "type":"address[]"
         },
         {
            "internalType":"uint256[]",
            "name":"navs",
            "type":"uint256[]"
         },
         {
            "internalType":"uint256[]",
            "name":"denominations",
            "type":"uint256[]"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getAllVaultOverviews",
      "outputs":[
         {
            "components":[
               {
                  "internalType":"address",
                  "name":"vault",
                  "type":"address"
               },
               {
                  "internalType":"address",
                  "name":"asset",
                  "type":"address"
               },
               {
                  "internalType":"uint256",
                  "name":"redeemShares",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256",
                  "name":"claimableAssets",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256",
                  "name":"pendingAssets",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256",
                  "name":"navAsset",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256",
                  "name":"navDenomination",
                  "type":"uint256"
               },
               {
                  "internalType":"bool",
                  "name":"isPaused",
                  "type":"bool"
               }
            ],
            "internalType":"struct HaVaultReader.VaultOverview[]",
            "name":"overviews",
            "type":"tuple[]"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"strategy",
            "type":"address"
         }
      ],
      "name":"getAllocated",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"vault",
            "type":"address"
         }
      ],
      "name":"getAssetForVault",
      "outputs":[
         {
            "internalType":"address",
            "name":"",
            "type":"address"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"asset",
            "type":"address"
         }
      ],
      "name":"getAssetNavAndDenomination",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"nav",
            "type":"uint256"
         },
         {
            "internalType":"uint256",
            "name":"denomination",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"asset",
            "type":"address"
         }
      ],
      "name":"getAssetPrice",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"vault",
            "type":"address"
         }
      ],
      "name":"getClaimableAssets",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getEffNavDenomination",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getFundNav",
      "outputs":[
         {
            "internalType":"address",
            "name":"",
            "type":"address"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getFundVault",
      "outputs":[
         {
            "internalType":"address",
            "name":"",
            "type":"address"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"asset",
            "type":"address"
         }
      ],
      "name":"getIdleAssets",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getNavDenomination",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getNavSnapshot",
      "outputs":[
         {
            "components":[
               {
                  "internalType":"uint256",
                  "name":"totalSupply",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256",
                  "name":"navDenomination",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256",
                  "name":"effNavDenomination",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256",
                  "name":"globalRedeemShares",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256[]",
                  "name":"assetTotalNavs",
                  "type":"uint256[]"
               },
               {
                  "internalType":"uint256",
                  "name":"ppsValue",
                  "type":"uint256"
               },
               {
                  "internalType":"bool",
                  "name":"isValidPps",
                  "type":"bool"
               }
            ],
            "internalType":"struct INavAggregateModel.NavResult",
            "name":"",
            "type":"tuple"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"vault",
            "type":"address"
         }
      ],
      "name":"getPendingAssets",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"controller",
            "type":"address"
         }
      ],
      "name":"getPendingShares",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"uint256",
            "name":"fromId",
            "type":"uint256"
         },
         {
            "internalType":"uint256",
            "name":"toId",
            "type":"uint256"
         }
      ],
      "name":"getPendingWithdrawals",
      "outputs":[
         {
            "components":[
               {
                  "internalType":"uint256",
                  "name":"id",
                  "type":"uint256"
               },
               {
                  "internalType":"address",
                  "name":"vault",
                  "type":"address"
               },
               {
                  "internalType":"address",
                  "name":"controller",
                  "type":"address"
               },
               {
                  "internalType":"uint256",
                  "name":"shares",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256",
                  "name":"assets",
                  "type":"uint256"
               },
               {
                  "internalType":"uint64",
                  "name":"requestedAt",
                  "type":"uint64"
               },
               {
                  "internalType":"bool",
                  "name":"isFulfilled",
                  "type":"bool"
               }
            ],
            "internalType":"struct HaVaultReader.PendingWithdraw[]",
            "name":"",
            "type":"tuple[]"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getPriceFeed",
      "outputs":[
         {
            "internalType":"address",
            "name":"",
            "type":"address"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getPricePerShare",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"uint256",
            "name":"id",
            "type":"uint256"
         }
      ],
      "name":"getRedeemById",
      "outputs":[
         {
            "components":[
               {
                  "internalType":"address",
                  "name":"vault",
                  "type":"address"
               },
               {
                  "internalType":"address",
                  "name":"controller",
                  "type":"address"
               }
            ],
            "internalType":"struct IAsyncRequestManager.RedeemEntry",
            "name":"entry",
            "type":"tuple"
         },
         {
            "components":[
               {
                  "internalType":"uint256",
                  "name":"shares",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256",
                  "name":"assets",
                  "type":"uint256"
               },
               {
                  "internalType":"uint64",
                  "name":"requestedAt",
                  "type":"uint64"
               },
               {
                  "internalType":"bool",
                  "name":"isFulfilled",
                  "type":"bool"
               }
            ],
            "internalType":"struct IAsyncRequestManager.RedeemRequest",
            "name":"data",
            "type":"tuple"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getRedeemMode",
      "outputs":[
         {
            "internalType":"enum IAsyncRequestManager.RedeemMode",
            "name":"",
            "type":"uint8"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"uint256",
            "name":"id",
            "type":"uint256"
         }
      ],
      "name":"getRedeemQueueEntry",
      "outputs":[
         {
            "components":[
               {
                  "internalType":"address",
                  "name":"vault",
                  "type":"address"
               },
               {
                  "internalType":"address",
                  "name":"controller",
                  "type":"address"
               }
            ],
            "internalType":"struct IAsyncRequestManager.RedeemEntry",
            "name":"",
            "type":"tuple"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getRedeemQueueLength",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"vault",
            "type":"address"
         }
      ],
      "name":"getRedeemShares",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getRegisteredAssets",
      "outputs":[
         {
            "internalType":"address[]",
            "name":"",
            "type":"address[]"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getRegisteredAssetsLength",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getRequestManager",
      "outputs":[
         {
            "internalType":"address",
            "name":"",
            "type":"address"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"getShareToken",
      "outputs":[
         {
            "internalType":"address",
            "name":"",
            "type":"address"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"asset",
            "type":"address"
         }
      ],
      "name":"getStrategies",
      "outputs":[
         {
            "internalType":"address[]",
            "name":"",
            "type":"address[]"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"asset",
            "type":"address"
         }
      ],
      "name":"getTotalManagedAssets",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"asset",
            "type":"address"
         }
      ],
      "name":"getVaultForAsset",
      "outputs":[
         {
            "internalType":"address",
            "name":"",
            "type":"address"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"vault",
            "type":"address"
         }
      ],
      "name":"getVaultOverview",
      "outputs":[
         {
            "components":[
               {
                  "internalType":"address",
                  "name":"vault",
                  "type":"address"
               },
               {
                  "internalType":"address",
                  "name":"asset",
                  "type":"address"
               },
               {
                  "internalType":"uint256",
                  "name":"redeemShares",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256",
                  "name":"claimableAssets",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256",
                  "name":"pendingAssets",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256",
                  "name":"navAsset",
                  "type":"uint256"
               },
               {
                  "internalType":"uint256",
                  "name":"navDenomination",
                  "type":"uint256"
               },
               {
                  "internalType":"bool",
                  "name":"isPaused",
                  "type":"bool"
               }
            ],
            "internalType":"struct HaVaultReader.VaultOverview",
            "name":"overview",
            "type":"tuple"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"vault",
            "type":"address"
         }
      ],
      "name":"getVaultStatus",
      "outputs":[
         {
            "internalType":"bool",
            "name":"isPaused",
            "type":"bool"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"bytes32",
            "name":"role",
            "type":"bytes32"
         },
         {
            "internalType":"address",
            "name":"account",
            "type":"address"
         }
      ],
      "name":"hasRole",
      "outputs":[
         {
            "internalType":"bool",
            "name":"",
            "type":"bool"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"vaultManagerAddr",
            "type":"address"
         }
      ],
      "name":"initialize",
      "outputs":[
         
      ],
      "stateMutability":"nonpayable",
      "type":"function"
   },
   {
      "inputs":[
         
      ],
      "name":"proxiableUUID",
      "outputs":[
         {
            "internalType":"bytes32",
            "name":"",
            "type":"bytes32"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"newImplementation",
            "type":"address"
         },
         {
            "internalType":"bytes",
            "name":"data",
            "type":"bytes"
         }
      ],
      "name":"upgradeToAndCall",
      "outputs":[
         
      ],
      "stateMutability":"payable",
      "type":"function"
   },
   {
      "inputs":[

      ],
      "name":"vaultManager",
      "outputs":[
         {
            "internalType":"address",
            "name":"",
            "type":"address"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"strategy",
            "type":"address"
         }
      ],
      "name":"getStrategyCap",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"strategy",
            "type":"address"
         }
      ],
      "name":"getTotalAllocated",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"strategy",
            "type":"address"
         }
      ],
      "name":"getTotalDeallocated",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"asset",
            "type":"address"
         }
      ],
      "name":"getTotalDeployedAssets",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"asset",
            "type":"address"
         },
         {
            "internalType":"address",
            "name":"strategy",
            "type":"address"
         }
      ],
      "name":"isStrategyWhitelisted",
      "outputs":[
         {
            "internalType":"bool",
            "name":"",
            "type":"bool"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   {
      "inputs":[
         {
            "internalType":"address",
            "name":"asset",
            "type":"address"
         }
      ],
      "name":"getStrategyCount",
      "outputs":[
         {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
         }
      ],
      "stateMutability":"view",
      "type":"function"
   },
   // ── Timelock reader functions ───────────────────────────────────────────────
   {
      "inputs": [
         { "internalType": "address", "name": "target", "type": "address" },
         { "internalType": "bytes4", "name": "selector", "type": "bytes4" }
      ],
      "name": "getTimelockDuration",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [],
      "name": "getFundVaultPending",
      "outputs": [
         {
            "components": [
               { "internalType": "bytes", "name": "data", "type": "bytes" },
               { "internalType": "bytes4", "name": "selector", "type": "bytes4" },
               { "internalType": "uint256", "name": "executableAt", "type": "uint256" },
               { "internalType": "bool", "name": "isReady", "type": "bool" }
            ],
            "internalType": "struct HaVaultReader.PendingOperation[]",
            "name": "",
            "type": "tuple[]"
         }
      ],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [],
      "name": "getVaultManagerAdminPending",
      "outputs": [
         {
            "components": [
               { "internalType": "bytes", "name": "data", "type": "bytes" },
               { "internalType": "bytes4", "name": "selector", "type": "bytes4" },
               { "internalType": "uint256", "name": "executableAt", "type": "uint256" },
               { "internalType": "bool", "name": "isReady", "type": "bool" }
            ],
            "internalType": "struct HaVaultReader.PendingOperation[]",
            "name": "",
            "type": "tuple[]"
         }
      ],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [{ "internalType": "address", "name": "target", "type": "address" }],
      "name": "getContractPending",
      "outputs": [
         {
            "components": [
               { "internalType": "bytes", "name": "data", "type": "bytes" },
               { "internalType": "bytes4", "name": "selector", "type": "bytes4" },
               { "internalType": "uint256", "name": "executableAt", "type": "uint256" },
               { "internalType": "bool", "name": "isReady", "type": "bool" }
            ],
            "internalType": "struct HaVaultReader.PendingOperation[]",
            "name": "",
            "type": "tuple[]"
         }
      ],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [
         { "internalType": "address", "name": "target", "type": "address" },
         { "internalType": "bytes", "name": "data", "type": "bytes" }
      ],
      "name": "getTimelockStatus",
      "outputs": [
         {
            "components": [
               { "internalType": "uint256", "name": "duration", "type": "uint256" },
               { "internalType": "uint256", "name": "executableAt", "type": "uint256" },
               { "internalType": "bool", "name": "isReady", "type": "bool" },
               { "internalType": "bool", "name": "isPending", "type": "bool" }
            ],
            "internalType": "struct HaVaultReader.TimelockStatus",
            "name": "status",
            "type": "tuple"
         }
      ],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [],
      "name": "getFeeReceiver",
      "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [],
      "name": "getManagementFeeRate",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [],
      "name": "getPerformanceFeeRate",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [],
      "name": "getHighWatermark",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [],
      "name": "getDeviationPps",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [],
      "name": "getMaxNavStaleness",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [],
      "name": "getLastNavUpdated",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [],
      "name": "getLastManagementHarvest",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [],
      "name": "getLastHarvestPerformanceFeeTime",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [],
      "name": "getEffectiveSupply",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
   },
   {
      "inputs": [],
      "name": "getFeeConfig",
      "outputs": [
         {
            "components": [
               { "internalType": "address", "name": "feeReceiver", "type": "address" },
               { "internalType": "uint256", "name": "managementFeeRate", "type": "uint256" },
               { "internalType": "uint256", "name": "lastManagementHarvest", "type": "uint256" },
               { "internalType": "uint256", "name": "performanceFeeRate", "type": "uint256" },
               { "internalType": "uint256", "name": "highWatermark", "type": "uint256" },
               { "internalType": "uint256", "name": "lastHarvestPerformanceFeeTime", "type": "uint256" }
            ],
            "internalType": "struct HaVaultReader.FeeConfig",
            "name": "",
            "type": "tuple"
         }
      ],
      "stateMutability": "view",
      "type": "function"
   }
] as const;