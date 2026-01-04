/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/wino_identity.json`.
 */
export type WinoIdentity = {
  "address": "BfW6uH2s3MaCyWk9qK87FD94zsfXEfjS1bwThVx6QT4x",
  "metadata": {
    "name": "winoIdentity",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Wino Business Identity PDA Program"
  },
  "instructions": [
    {
      "name": "createIdentity",
      "docs": [
        "Create a new business identity PDA",
        "",
        "This creates a unique identity account for a wallet.",
        "Each wallet can only have ONE identity."
      ],
      "discriminator": [
        12,
        253,
        209,
        41,
        176,
        51,
        195,
        179
      ],
      "accounts": [
        {
          "name": "identity",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  111,
                  95,
                  98,
                  117,
                  115,
                  105,
                  110,
                  101,
                  115,
                  115,
                  95,
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
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
          "name": "name",
          "type": "string"
        },
        {
          "name": "logoUri",
          "type": "string"
        }
      ]
    },
    {
      "name": "updateIdentity",
      "docs": [
        "Update an existing business identity",
        "",
        "Only the original authority can update their identity."
      ],
      "discriminator": [
        130,
        54,
        88,
        104,
        222,
        124,
        238,
        252
      ],
      "accounts": [
        {
          "name": "identity",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  105,
                  110,
                  111,
                  95,
                  98,
                  117,
                  115,
                  105,
                  110,
                  101,
                  115,
                  115,
                  95,
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "logoUri",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "businessIdentity",
      "discriminator": [
        187,
        189,
        174,
        121,
        23,
        105,
        212,
        235
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidNameLength",
      "msg": "Name must be 1-64 characters"
    },
    {
      "code": 6001,
      "name": "invalidLogoUriLength",
      "msg": "Logo URI must be at most 200 characters"
    },
    {
      "code": 6002,
      "name": "unauthorized",
      "msg": "Only the identity owner can perform this action"
    }
  ],
  "types": [
    {
      "name": "businessIdentity",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "The wallet that owns this identity"
            ],
            "type": "pubkey"
          },
          {
            "name": "identityType",
            "docs": [
              "Type of identity (1 = business)"
            ],
            "type": "u8"
          },
          {
            "name": "name",
            "docs": [
              "Business name (max 64 bytes)"
            ],
            "type": "string"
          },
          {
            "name": "logoUri",
            "docs": [
              "Logo URI on Arweave/Irys (max 200 bytes)"
            ],
            "type": "string"
          },
          {
            "name": "createdAt",
            "docs": [
              "Unix timestamp when created"
            ],
            "type": "i64"
          },
          {
            "name": "updatedAt",
            "docs": [
              "Unix timestamp when last updated"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    }
  ]
};
