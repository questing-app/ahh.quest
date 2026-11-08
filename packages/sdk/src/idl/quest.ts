/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/quest.json`.
 */
export type Quest = {
  "address": "JDWcp8gXX4sypdDc9h8zHVMjM9nTSWxfY16ThnsS7BLM",
  "metadata": {
    "name": "quest",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "QUEST - Social challenge protocol"
  },
  "instructions": [
    {
      "name": "abandonClaim",
      "docs": [
        "Claimer voluntarily abandons — forfeits stake to creator"
      ],
      "discriminator": [
        232,
        223,
        66,
        64,
        76,
        12,
        182,
        195
      ],
      "accounts": [
        {
          "name": "quest",
          "writable": true
        },
        {
          "name": "claim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "quest"
              },
              {
                "kind": "account",
                "path": "claimer"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "quest"
              }
            ]
          }
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "claimer",
          "signer": true
        },
        {
          "name": "rewardMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "approveCompletion",
      "docs": [
        "Oracle-only: approve after AI or creator verification"
      ],
      "discriminator": [
        191,
        196,
        91,
        103,
        232,
        146,
        6,
        67
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "quest",
          "writable": true
        },
        {
          "name": "claim",
          "writable": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "quest"
              }
            ]
          }
        },
        {
          "name": "claimerTokenAccount",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "rewardMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "autoApprove",
      "docs": [
        "Permissionless crank: auto-approve after review deadline (creator didn't respond)"
      ],
      "discriminator": [
        36,
        58,
        85,
        199,
        138,
        197,
        222,
        178
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "quest",
          "writable": true
        },
        {
          "name": "claim",
          "writable": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "quest"
              }
            ]
          }
        },
        {
          "name": "claimerTokenAccount",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "cranker",
          "signer": true
        },
        {
          "name": "rewardMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "cancelQuest",
      "discriminator": [
        204,
        232,
        50,
        68,
        92,
        169,
        110,
        198
      ],
      "accounts": [
        {
          "name": "quest",
          "writable": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "quest"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "rewardMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "claimQuest",
      "discriminator": [
        38,
        197,
        33,
        123,
        0,
        108,
        206,
        161
      ],
      "accounts": [
        {
          "name": "quest",
          "writable": true
        },
        {
          "name": "claim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "quest"
              },
              {
                "kind": "account",
                "path": "claimer"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "quest"
              }
            ]
          }
        },
        {
          "name": "claimer",
          "writable": true,
          "signer": true
        },
        {
          "name": "claimerTokenAccount",
          "writable": true
        },
        {
          "name": "rewardMint"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "stakeAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createQuest",
      "discriminator": [
        112,
        49,
        32,
        224,
        255,
        173,
        5,
        7
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "quest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config.quest_count",
                "account": "questConfig"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "quest"
              }
            ]
          }
        },
        {
          "name": "rewardMint"
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "rewardAmount",
          "type": "u64"
        },
        {
          "name": "questType",
          "type": {
            "defined": {
              "name": "questType"
            }
          }
        },
        {
          "name": "target",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "maxClaimers",
          "type": "u8"
        },
        {
          "name": "timeLimit",
          "type": {
            "option": "i64"
          }
        },
        {
          "name": "descriptionHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "expireClaim",
      "docs": [
        "Permissionless crank: expire claim after proof deadline"
      ],
      "discriminator": [
        176,
        78,
        241,
        29,
        159,
        81,
        26,
        6
      ],
      "accounts": [
        {
          "name": "quest",
          "writable": true
        },
        {
          "name": "claim",
          "writable": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "quest"
              }
            ]
          }
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "cranker",
          "signer": true
        },
        {
          "name": "rewardMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "feeBasisPoints",
          "type": "u16"
        },
        {
          "name": "burnBasisPoints",
          "type": "u16"
        }
      ]
    },
    {
      "name": "rejectCompletion",
      "docs": [
        "Oracle-only: reject completion",
        "safety_flagged: if true, return stake to claimer (content issue, not their fault)"
      ],
      "discriminator": [
        167,
        64,
        81,
        165,
        234,
        217,
        188,
        2
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "quest",
          "writable": true
        },
        {
          "name": "claim",
          "writable": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "quest"
              }
            ]
          }
        },
        {
          "name": "creatorTokenAccount",
          "writable": true
        },
        {
          "name": "claimerTokenAccount",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "rewardMint"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "safetyFlagged",
          "type": "bool"
        }
      ]
    },
    {
      "name": "submitProof",
      "discriminator": [
        54,
        241,
        46,
        84,
        4,
        212,
        46,
        94
      ],
      "accounts": [
        {
          "name": "quest"
        },
        {
          "name": "claim",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "quest"
              },
              {
                "kind": "account",
                "path": "claimer"
              }
            ]
          }
        },
        {
          "name": "claimer",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "proofHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "claim",
      "discriminator": [
        155,
        70,
        22,
        176,
        123,
        215,
        246,
        102
      ]
    },
    {
      "name": "quest",
      "discriminator": [
        68,
        78,
        51,
        23,
        204,
        27,
        76,
        132
      ]
    },
    {
      "name": "questConfig",
      "discriminator": [
        181,
        88,
        213,
        44,
        1,
        15,
        244,
        70
      ]
    }
  ],
  "events": [
    {
      "name": "claimAbandoned",
      "discriminator": [
        106,
        172,
        70,
        17,
        69,
        32,
        143,
        137
      ]
    },
    {
      "name": "claimExpired",
      "discriminator": [
        224,
        96,
        139,
        90,
        26,
        10,
        65,
        93
      ]
    },
    {
      "name": "proofSubmitted",
      "discriminator": [
        160,
        51,
        85,
        70,
        249,
        89,
        5,
        139
      ]
    },
    {
      "name": "protocolInitialized",
      "discriminator": [
        173,
        122,
        168,
        254,
        9,
        118,
        76,
        132
      ]
    },
    {
      "name": "questCancelled",
      "discriminator": [
        180,
        76,
        82,
        192,
        51,
        17,
        186,
        11
      ]
    },
    {
      "name": "questClaimed",
      "discriminator": [
        49,
        134,
        11,
        29,
        35,
        182,
        38,
        197
      ]
    },
    {
      "name": "questCompleted",
      "discriminator": [
        185,
        225,
        220,
        84,
        209,
        183,
        217,
        238
      ]
    },
    {
      "name": "questCreated",
      "discriminator": [
        179,
        90,
        201,
        178,
        90,
        69,
        73,
        67
      ]
    },
    {
      "name": "questFailed",
      "discriminator": [
        113,
        125,
        155,
        160,
        56,
        203,
        78,
        233
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "rewardTooLow",
      "msg": "Reward below minimum"
    },
    {
      "code": 6001,
      "name": "invalidMaxClaimers",
      "msg": "Invalid max claimers"
    },
    {
      "code": 6002,
      "name": "questNotActive",
      "msg": "Quest is not active"
    },
    {
      "code": 6003,
      "name": "questFull",
      "msg": "Quest is full"
    },
    {
      "code": 6004,
      "name": "questExpired",
      "msg": "Quest has expired"
    },
    {
      "code": 6005,
      "name": "notTargetUser",
      "msg": "Not the target user for this quest"
    },
    {
      "code": 6006,
      "name": "claimNotActive",
      "msg": "Claim is not active"
    },
    {
      "code": 6007,
      "name": "notClaimer",
      "msg": "Not the claimer"
    },
    {
      "code": 6008,
      "name": "claimNotSubmitted",
      "msg": "Claim not submitted"
    },
    {
      "code": 6009,
      "name": "notOracle",
      "msg": "Not authorized (oracle only)"
    },
    {
      "code": 6010,
      "name": "notCreator",
      "msg": "Not the creator"
    },
    {
      "code": 6011,
      "name": "questAlreadyClaimed",
      "msg": "Quest already claimed"
    },
    {
      "code": 6012,
      "name": "cannotClaimOwnQuest",
      "msg": "Cannot claim your own quest"
    },
    {
      "code": 6013,
      "name": "stakeTooLow",
      "msg": "Stake below minimum (5% of reward)"
    },
    {
      "code": 6014,
      "name": "directQuestNeedsTarget",
      "msg": "Direct quest requires a target"
    },
    {
      "code": 6015,
      "name": "cannotTargetSelf",
      "msg": "Cannot target yourself"
    },
    {
      "code": 6016,
      "name": "proofDeadlinePassed",
      "msg": "Proof deadline has passed"
    },
    {
      "code": 6017,
      "name": "deadlineNotReached",
      "msg": "Deadline not yet reached"
    },
    {
      "code": 6018,
      "name": "noReviewDeadline",
      "msg": "No review deadline set"
    },
    {
      "code": 6019,
      "name": "invalidTimeLimit",
      "msg": "Invalid time limit"
    },
    {
      "code": 6020,
      "name": "invalidFeeConfig",
      "msg": "Invalid fee configuration"
    },
    {
      "code": 6021,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6022,
      "name": "wrongTokenAccount",
      "msg": "Token account has the wrong owner or mint"
    },
    {
      "code": 6023,
      "name": "claimQuestMismatch",
      "msg": "Claim does not belong to this quest"
    }
  ],
  "types": [
    {
      "name": "claim",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "quest",
            "type": "pubkey"
          },
          {
            "name": "claimer",
            "type": "pubkey"
          },
          {
            "name": "stakeAmount",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "claimStatus"
              }
            }
          },
          {
            "name": "proofDeadline",
            "type": "i64"
          },
          {
            "name": "reviewDeadline",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "proofHash",
            "type": {
              "option": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          },
          {
            "name": "claimedAt",
            "type": "i64"
          },
          {
            "name": "submittedAt",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "claimAbandoned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "questId",
            "type": "u64"
          },
          {
            "name": "claimer",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "claimExpired",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "questId",
            "type": "u64"
          },
          {
            "name": "claimer",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "claimStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "submitted"
          },
          {
            "name": "approved"
          },
          {
            "name": "rejected"
          },
          {
            "name": "abandoned"
          },
          {
            "name": "expired"
          }
        ]
      }
    },
    {
      "name": "failReason",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "rejected"
          },
          {
            "name": "expired"
          },
          {
            "name": "abandoned"
          }
        ]
      }
    },
    {
      "name": "proofSubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "questId",
            "type": "u64"
          },
          {
            "name": "claimer",
            "type": "pubkey"
          },
          {
            "name": "proofHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "protocolInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "feeBasisPoints",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "quest",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "escrow",
            "type": "pubkey"
          },
          {
            "name": "rewardMint",
            "type": "pubkey"
          },
          {
            "name": "rewardAmount",
            "type": "u64"
          },
          {
            "name": "questType",
            "type": {
              "defined": {
                "name": "questType"
              }
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "questStatus"
              }
            }
          },
          {
            "name": "target",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "maxClaimers",
            "type": "u8"
          },
          {
            "name": "currentClaimers",
            "type": "u8"
          },
          {
            "name": "timeLimit",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "proofDeadlineHours",
            "type": "u8"
          },
          {
            "name": "reviewDeadlineHours",
            "type": "u8"
          },
          {
            "name": "descriptionHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "questCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "questId",
            "type": "u64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "questClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "questId",
            "type": "u64"
          },
          {
            "name": "claimer",
            "type": "pubkey"
          },
          {
            "name": "stakeAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "questCompleted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "questId",
            "type": "u64"
          },
          {
            "name": "claimer",
            "type": "pubkey"
          },
          {
            "name": "rewardAmount",
            "type": "u64"
          },
          {
            "name": "feeAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "questConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "feeBasisPoints",
            "type": "u16"
          },
          {
            "name": "burnBasisPoints",
            "type": "u16"
          },
          {
            "name": "questCount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "questCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "questId",
            "type": "u64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "rewardAmount",
            "type": "u64"
          },
          {
            "name": "rewardMint",
            "type": "pubkey"
          },
          {
            "name": "questType",
            "type": {
              "defined": {
                "name": "questType"
              }
            }
          }
        ]
      }
    },
    {
      "name": "questFailed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "questId",
            "type": "u64"
          },
          {
            "name": "claimer",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": {
              "defined": {
                "name": "failReason"
              }
            }
          }
        ]
      }
    },
    {
      "name": "questStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "claimed"
          },
          {
            "name": "completed"
          },
          {
            "name": "failed"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "expired"
          }
        ]
      }
    },
    {
      "name": "questType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "direct"
          },
          {
            "name": "open"
          }
        ]
      }
    }
  ]
};
