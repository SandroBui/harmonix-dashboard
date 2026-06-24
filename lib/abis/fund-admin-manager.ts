export const FUND_ADMIN_MANAGER_ABI = [
    {
      "inputs": [],
      "name": "AccessControlBadConfirmation",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        },
        {
          "internalType": "bytes32",
          "name": "neededRole",
          "type": "bytes32"
        }
      ],
      "name": "AccessControlUnauthorizedAccount",
      "type": "error"
    },
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
      "inputs": [],
      "name": "ReentrancyGuardReentrantCall",
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
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "previousAdminRole",
          "type": "bytes32"
        },
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "newAdminRole",
          "type": "bytes32"
        }
      ],
      "name": "RoleAdminChanged",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "account",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "sender",
          "type": "address"
        }
      ],
      "name": "RoleGranted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "account",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "sender",
          "type": "address"
        }
      ],
      "name": "RoleRevoked",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "DEFAULT_ADMIN_ROLE",
      "outputs": [
        {
          "internalType": "bytes32",
          "name": "",
          "type": "bytes32"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "fundContract",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
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
        }
      ],
      "name": "getRoleAdmin",
      "outputs": [
        {
          "internalType": "bytes32",
          "name": "",
          "type": "bytes32"
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
          "internalType": "address",
          "name": "admin",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_fundStorage",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_fundContract",
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
          "internalType": "bytes32",
          "name": "role",
          "type": "bytes32"
        },
        {
          "internalType": "address",
          "name": "callerConfirmation",
          "type": "address"
        }
      ],
      "name": "renounceRole",
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
      "name": "revokeRole",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bool",
          "name": "_paused",
          "type": "bool"
        }
      ],
      "name": "setPaused",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_fundContract",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_minimumSupply",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_capacity",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_performanceFeeRate",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_managementFeeRate",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "_managementFeeReceiver",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_performanceFeeReceiver",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_networkCost",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_tokenDecimals",
          "type": "uint256"
        }
      ],
      "name": "setupVault",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes4",
          "name": "interfaceId",
          "type": "bytes4"
        }
      ],
      "name": "supportsInterface",
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
          "internalType": "uint256",
          "name": "_capacity",
          "type": "uint256"
        }
      ],
      "name": "updateCapacity",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_managementFeeRate",
          "type": "uint256"
        }
      ],
      "name": "updateManagementFeeRate",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_managementFeeReceiver",
          "type": "address"
        }
      ],
      "name": "updateManagementFeeReceiver",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_maxNavStaleness",
          "type": "uint256"
        }
      ],
      "name": "updateMaxNavStaleness",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_minimumSupply",
          "type": "uint256"
        }
      ],
      "name": "updateMinimumSupply",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_pendingWithdrawShares",
          "type": "uint256"
        }
      ],
      "name": "updatePendingWithdrawShares",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_performanceFeeRate",
          "type": "uint256"
        }
      ],
      "name": "updatePerformanceFeeRate",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_performanceFeeReceiver",
          "type": "address"
        }
      ],
      "name": "updatePerformanceFeeReceiver",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_ppsDeviationBps",
          "type": "uint256"
        }
      ],
      "name": "updatePpsDeviationBps",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_minimumSupply",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_capacity",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_performanceFeeRate",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_managementFeeRate",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "_managementFeeReceiver",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_performanceFeeReceiver",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_networkCost",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_ppsDeviationBps",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_maxNavStaleness",
          "type": "uint256"
        }
      ],
      "name": "updateVaultSetting",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_highWatermark",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_deployedTimestamp",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_lastHarvestManagementFeeTime",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_lastHarvestPerformanceFeeTime",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_pendingWithdrawAmount",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_pendingWithdrawShares",
          "type": "uint256"
        }
      ],
      "name": "updateVaultState",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ] as const