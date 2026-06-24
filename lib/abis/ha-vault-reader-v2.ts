export const HA_VAULT_READER_V2_ABI = [
    {
      "inputs": [],
      "name": "InvalidInitialization",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "NotInitializing",
      "type": "error"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint64",
          "name": "version",
          "type": "uint64"
        }
      ],
      "name": "Initialized",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        }
      ],
      "name": "getDeployedTime",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        }
      ],
      "name": "getFeeInfo",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "performanceFee",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "managementFee",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        }
      ],
      "name": "getManagementFeeAmount",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        }
      ],
      "name": "getPerformanceFeeAmount",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_user",
          "type": "address"
        }
      ],
      "name": "getUserWithdrawShares",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_user",
          "type": "address"
        }
      ],
      "name": "getUserWithdrawal",
      "outputs": [
        {
          "components": [
            {
              "internalType": "uint256",
              "name": "shares",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "pricePerShare",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "withdrawAmount",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "managementFee",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "createdAt",
              "type": "uint256"
            },
            {
              "internalType": "bool",
              "name": "isAcquired",
              "type": "bool"
            },
            {
              "internalType": "bool",
              "name": "isCollectNetworkCost",
              "type": "bool"
            }
          ],
          "internalType": "struct UserWithdraw.WithdrawData",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        }
      ],
      "name": "getVaultSetting",
      "outputs": [
        {
          "components": [
            {
              "internalType": "uint256",
              "name": "minimumSupply",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "capacity",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "performanceFeeRate",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "managementFeeRate",
              "type": "uint256"
            },
            {
              "internalType": "address",
              "name": "managementFeeReceiver",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "performanceFeeReceiver",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "networkCost",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "ppsDeviationBps",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "maxNavStaleness",
              "type": "uint256"
            }
          ],
          "internalType": "struct VaultStore.VaultSetting",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        }
      ],
      "name": "getVaultState",
      "outputs": [
        {
          "components": [
            {
              "internalType": "uint256",
              "name": "pricePerShare",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "withdrawPoolAmount",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "lastHarvestManagementFeeTime",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "lastHarvestPerformanceFeeTime",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "nav",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "deployedTimestamp",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "highWatermark",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "pendingWithdrawAmount",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "pendingWithdrawShares",
              "type": "uint256"
            }
          ],
          "internalType": "struct VaultStore.VaultState",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        }
      ],
      "name": "getWithdrawPoolAmount",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        }
      ],
      "name": "highWatermark",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_fundStorage",
          "type": "address"
        }
      ],
      "name": "initialize",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        }
      ],
      "name": "lastHarvestManagementFeeTime",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        }
      ],
      "name": "lastHarvestPerformanceFeeTime",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        }
      ],
      "name": "pricePerShare",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_vault",
          "type": "address"
        }
      ],
      "name": "totalValueLocked",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "grantRole",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "hasRole",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "revokeRole",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ] as const;