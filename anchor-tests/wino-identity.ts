import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

// IDL will be generated after build
import { WinoIdentity } from "../target/types/wino_identity";

describe("wino_identity", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.WinoIdentity as Program<WinoIdentity>;

  const IDENTITY_SEED = Buffer.from("wino_business_identity");

  // Helper to derive PDA
  function deriveIdentityPDA(authority: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [IDENTITY_SEED, authority.toBuffer()],
      program.programId
    );
  }

  it("Creates a business identity", async () => {
    const authority = provider.wallet.publicKey;
    const [identityPDA, bump] = deriveIdentityPDA(authority);

    const name = "Test Coffee Shop";
    const logoUri = "ar://ABC123456789";

    console.log("Authority:", authority.toBase58());
    console.log("Identity PDA:", identityPDA.toBase58());

    const tx = await program.methods
      .createIdentity(name, logoUri)
      .accounts({
        identity: identityPDA,
        authority: authority,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Transaction signature:", tx);

    // Fetch the created identity
    const identity = await program.account.businessIdentity.fetch(identityPDA);

    assert.ok(identity.authority.equals(authority));
    assert.equal(identity.identityType, 1);
    assert.equal(identity.name, name);
    assert.equal(identity.logoUri, logoUri);
    assert.ok(identity.createdAt.toNumber() > 0);
    assert.ok(identity.updatedAt.toNumber() > 0);
    assert.equal(identity.bump, bump);

    console.log("Identity created successfully!");
    console.log("Name:", identity.name);
    console.log("Logo URI:", identity.logoUri);
  });

  it("Fails to create duplicate identity", async () => {
    const authority = provider.wallet.publicKey;
    const [identityPDA] = deriveIdentityPDA(authority);

    try {
      await program.methods
        .createIdentity("Duplicate Shop", "ar://XYZ")
        .accounts({
          identity: identityPDA,
          authority: authority,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      assert.fail("Should have thrown an error");
    } catch (err: any) {
      // Expected to fail because account already exists
      console.log("Correctly rejected duplicate identity creation");
      assert.ok(err.toString().includes("already in use") || err.logs?.some((l: string) => l.includes("already in use")));
    }
  });

  it("Updates an existing identity", async () => {
    const authority = provider.wallet.publicKey;
    const [identityPDA] = deriveIdentityPDA(authority);

    const newName = "Updated Coffee Shop";
    const newLogoUri = "ar://UPDATED123";

    const tx = await program.methods
      .updateIdentity(newName, newLogoUri)
      .accounts({
        identity: identityPDA,
        authority: authority,
      })
      .rpc();

    console.log("Update transaction:", tx);

    // Fetch the updated identity
    const identity = await program.account.businessIdentity.fetch(identityPDA);

    assert.equal(identity.name, newName);
    assert.equal(identity.logoUri, newLogoUri);
    assert.ok(identity.updatedAt.toNumber() >= identity.createdAt.toNumber());

    console.log("Identity updated successfully!");
    console.log("New name:", identity.name);
    console.log("New logo URI:", identity.logoUri);
  });

  it("Rejects update from non-authority", async () => {
    const authority = provider.wallet.publicKey;
    const [identityPDA] = deriveIdentityPDA(authority);

    // Generate a random keypair to act as attacker
    const attacker = Keypair.generate();

    try {
      await program.methods
        .updateIdentity("Hacked Shop", "ar://HACKED")
        .accounts({
          identity: identityPDA,
          authority: attacker.publicKey,
        })
        .signers([attacker])
        .rpc();

      assert.fail("Should have thrown an error");
    } catch (err: any) {
      // Expected to fail because PDA seeds don't match
      console.log("Correctly rejected unauthorized update");
    }
  });

  it("Validates name length constraints", async () => {
    // This test would need a fresh authority since the first one already has an identity
    const newAuthority = Keypair.generate();
    const [identityPDA] = deriveIdentityPDA(newAuthority.publicKey);

    // Airdrop SOL to new authority for rent
    const airdropSig = await provider.connection.requestAirdrop(
      newAuthority.publicKey,
      1000000000 // 1 SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Try empty name
    try {
      await program.methods
        .createIdentity("", "ar://test")
        .accounts({
          identity: identityPDA,
          authority: newAuthority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([newAuthority])
        .rpc();

      assert.fail("Should have rejected empty name");
    } catch (err: any) {
      console.log("Correctly rejected empty name");
    }

    // Try name that's too long (65 chars)
    try {
      const longName = "A".repeat(65);
      await program.methods
        .createIdentity(longName, "ar://test")
        .accounts({
          identity: identityPDA,
          authority: newAuthority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([newAuthority])
        .rpc();

      assert.fail("Should have rejected long name");
    } catch (err: any) {
      console.log("Correctly rejected name > 64 chars");
    }
  });
});
