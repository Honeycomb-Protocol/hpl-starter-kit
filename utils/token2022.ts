import { BN } from "@coral-xyz/anchor";
import { TransactionBuilderSendAndConfirmOptions } from "@metaplex-foundation/umi";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AuthorityType,
  createAssociatedTokenAccountInstruction,
  createInitializeGroupMemberPointerInstruction,
  createInitializeGroupPointerInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  ExtensionType,
  getAssociatedTokenAddressSync,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  createInitializeGroupInstruction,
  createInitializeMemberInstruction,
} from "@solana/spl-token-group";
import {
  createInitializeInstruction as createInitializeMetadataInstruction,
  pack as packMetadata,
} from "@solana/spl-token-metadata";
import * as web3 from "@solana/web3.js";
import {
  adminKeypair,
  connection,
  libreplexFairLaunchProgram,
  userKeypair,
} from ".";

export const create2022Group = async (
  data: { name: string; symbol: string; uri: string; maxSize: number },
  connection: web3.Connection,
  benificiary: web3.PublicKey,
  authority: web3.Keypair,
  payer: web3.Keypair,
  finalAuthority?: web3.PublicKey,
  options: TransactionBuilderSendAndConfirmOptions = {
    confirm: {
      commitment: "finalized",
    },
  }
) => {
  const mint = web3.Keypair.generate();
  const tokenAccount = getAssociatedTokenAddressSync(
    mint.publicKey,
    benificiary,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const extensions = [
    ExtensionType.GroupPointer,
    ExtensionType.MetadataPointer,
  ];
  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(
    mintLen
  );

  const metadataLen = packMetadata({
    ...data,
    mint: mint.publicKey,
    additionalMetadata: [],
  }).length;
  const metadataLamports = await connection.getMinimumBalanceForRentExemption(
    metadataLen
  );

  let transaction = new web3.Transaction().add(
    web3.ComputeBudgetProgram.setComputeUnitLimit({
      units: 500_000,
    }),
    web3.SystemProgram.createAccount({
      fromPubkey: adminKeypair.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeGroupPointerInstruction(
      mint.publicKey,
      adminKeypair.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      adminKeypair.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      0,
      adminKeypair.publicKey,
      adminKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeGroupInstruction({
      group: mint.publicKey,
      mint: mint.publicKey,
      maxSize: BigInt(1000),
      mintAuthority: adminKeypair.publicKey,
      updateAuthority: adminKeypair.publicKey,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    web3.SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: mint.publicKey,
      lamports: metadataLamports,
    }),
    createInitializeMetadataInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: adminKeypair.publicKey,
      mint: mint.publicKey,
      mintAuthority: adminKeypair.publicKey,
      ...data,
    }),

    ...(finalAuthority
      ? [
          createSetAuthorityInstruction(
            mint.publicKey,
            adminKeypair.publicKey,
            AuthorityType.FreezeAccount,
            finalAuthority,
            [],
            TOKEN_2022_PROGRAM_ID
          ),
          createSetAuthorityInstruction(
            mint.publicKey,
            adminKeypair.publicKey,
            AuthorityType.GroupMemberPointer,
            finalAuthority,
            [],
            TOKEN_2022_PROGRAM_ID
          ),
        ]
      : []),

    createAssociatedTokenAccountInstruction(
      adminKeypair.publicKey,
      tokenAccount,
      benificiary,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    createMintToInstruction(
      mint.publicKey,
      tokenAccount,
      adminKeypair.publicKey,
      1,
      [],
      TOKEN_2022_PROGRAM_ID
    ),
    createSetAuthorityInstruction(
      mint.publicKey,
      adminKeypair.publicKey,
      AuthorityType.MintTokens,
      null,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );
  transaction.feePayer = payer.publicKey;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  (transaction.recentBlockhash = blockhash),
    (transaction.lastValidBlockHeight = lastValidBlockHeight);
  transaction.sign(payer, authority, mint);
  const signature = await connection.sendRawTransaction(
    transaction.serialize(),
    options.send
  );
  await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    options.confirm.commitment
  );

  return {
    mint: mint,
    tokenAccount,
    signature,
  };
};

export const mintOne2022Nft = async (
  data: { name: string; symbol: string; uri: string },
  connection: web3.Connection,
  benificiary: web3.PublicKey,
  authority: web3.Keypair,
  payer: web3.Keypair,
  finalAuthority?: web3.PublicKey,
  group?: {
    groupAddress: web3.PublicKey;
    updateAuthority: web3.Signer;
  },
  options: TransactionBuilderSendAndConfirmOptions = {
    confirm: {
      commitment: "finalized",
    },
  }
) => {
  const mint = web3.Keypair.generate();
  const tokenAccount = getAssociatedTokenAddressSync(
    mint.publicKey,
    benificiary,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const extensions = [ExtensionType.MetadataPointer];

  if (group) {
    extensions.push(ExtensionType.GroupMemberPointer);
  }

  const mintLen = getMintLen(extensions);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(
    mintLen
  );

  const metadataLen = packMetadata({
    ...data,
    mint: mint.publicKey,
    additionalMetadata: [],
  }).length;
  const metadataLamports = await connection.getMinimumBalanceForRentExemption(
    metadataLen
  );

  let transaction = new web3.Transaction().add(
    web3.ComputeBudgetProgram.setComputeUnitLimit({
      units: 500_000,
    }),
    web3.SystemProgram.createAccount({
      fromPubkey: adminKeypair.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      adminKeypair.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),

    ...(group
      ? [
          createInitializeGroupMemberPointerInstruction(
            mint.publicKey,
            adminKeypair.publicKey,
            mint.publicKey,
            TOKEN_2022_PROGRAM_ID
          ),
        ]
      : []),

    createInitializeMintInstruction(
      mint.publicKey,
      0,
      adminKeypair.publicKey,
      adminKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    ...(group
      ? [
          createInitializeMemberInstruction({
            programId: TOKEN_2022_PROGRAM_ID,
            group: group.groupAddress,
            groupUpdateAuthority: group.updateAuthority.publicKey,
            member: mint.publicKey,
            memberMint: mint.publicKey,
            memberMintAuthority: adminKeypair.publicKey,
          }),
        ]
      : []),
    web3.SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: mint.publicKey,
      lamports: metadataLamports,
    }),
    createInitializeMetadataInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: adminKeypair.publicKey,
      mint: mint.publicKey,
      mintAuthority: adminKeypair.publicKey,
      ...data,
    }),

    ...(finalAuthority
      ? [
          createSetAuthorityInstruction(
            mint.publicKey,
            adminKeypair.publicKey,
            AuthorityType.FreezeAccount,
            finalAuthority,
            [],
            TOKEN_2022_PROGRAM_ID
          ),
          createSetAuthorityInstruction(
            mint.publicKey,
            adminKeypair.publicKey,
            AuthorityType.GroupMemberPointer,
            finalAuthority,
            [],
            TOKEN_2022_PROGRAM_ID
          ),
        ]
      : []),

    createAssociatedTokenAccountInstruction(
      adminKeypair.publicKey,
      tokenAccount,
      benificiary,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    createMintToInstruction(
      mint.publicKey,
      tokenAccount,
      adminKeypair.publicKey,
      1,
      [],
      TOKEN_2022_PROGRAM_ID
    ),
    createSetAuthorityInstruction(
      mint.publicKey,
      adminKeypair.publicKey,
      AuthorityType.MintTokens,
      null,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );
  transaction.feePayer = payer.publicKey;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  (transaction.recentBlockhash = blockhash),
    (transaction.lastValidBlockHeight = lastValidBlockHeight);
  transaction.sign(
    payer,
    authority,
    mint,
    ...(group ? [group.updateAuthority] : [])
  );
  const signature = await connection.sendRawTransaction(
    transaction.serialize(),
    options.send
  );
  await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    options.confirm.commitment
  );

  return {
    mint: mint,
    tokenAccount,
    signature,
  };
};

export const mintLibreplexFairLaunch = async (
  name: string,
  uri: string,
  benificiary: web3.PublicKey
) => {
  const data = await multipleMintLibreplexFairLaunch(name, uri, benificiary, 1);
  return {
    ...data,
    ...data.data[0],
  };
};

export const multipleMintLibreplexFairLaunch = async (
  name: string,
  uri: string,
  benificiary: web3.PublicKey,
  supply: number
) => {
  const LIMIT_PER_MINT = 1000;
  const MAX_NUMBER_OF_TOKENS = 1;
  const DECIMALS = 0;
  const TOKEN2022_DEPLOYMENT_TYPE = 3;
  const CREATOR_FEE_IN_LAMPORTS = 10_000_000;

  const [deployment] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("deployment"), Buffer.from(name)],
    libreplexFairLaunchProgram.programId
  );

  const [deploymentConfig] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("deployment_config"), deployment.toBuffer()],
    libreplexFairLaunchProgram.programId
  );

  const deploymentTemplate = name + "-deploy";
  const mintTemplate = name + "-mint";

  let sig = await libreplexFairLaunchProgram.methods
    .initialiseV3({
      limitPerMint: new BN(LIMIT_PER_MINT),
      maxNumberOfTokens: new BN(MAX_NUMBER_OF_TOKENS),
      decimals: DECIMALS,
      ticker: name,
      deploymentTemplate,
      mintTemplate,
      offchainUrl: uri,
      creatorCosignProgramId: web3.SystemProgram.programId,
      useInscriptions: false,
      deploymentType: TOKEN2022_DEPLOYMENT_TYPE,
      creatorFeePerMintInLamports: new BN(CREATOR_FEE_IN_LAMPORTS),
      creatorFeeTreasury: adminKeypair.publicKey,
      transferFeeConfig: null,
      multiplierLimits: {
        maxNumerator: 1,
        minDenominator: 1,
      },
    })
    .accounts({
      deployment,
      deploymentConfig,
      payer: adminKeypair.publicKey,
      creator: adminKeypair.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  const [hashlist] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("hashlist"), deployment.toBuffer()],
    libreplexFairLaunchProgram.programId
  );

  const fungibleMint = web3.Keypair.generate();
  const fungibleEscrowTokenAccount = getAssociatedTokenAddressSync(
    fungibleMint.publicKey,
    deployment,
    true,
    TOKEN_2022_PROGRAM_ID
  );

  sig = await libreplexFairLaunchProgram.methods
    .deployToken22()
    .accounts({
      deployment,
      deploymentConfig,
      hashlist,
      payer: adminKeypair.publicKey,
      creator: adminKeypair.publicKey,
      fungibleMint: fungibleMint.publicKey,
      fungibleEscrowTokenAccount,
      tokenProgram2022: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      sysvarInstructions: web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      rent: web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([fungibleMint])
    .rpc();

  const data: {
    nonFungibleMint: web3.PublicKey;
    hashlistMarker: web3.PublicKey;
    nonFungibleTokenAccount: web3.PublicKey;
  }[] = [];

  for (let i = 0; i < supply; i++) {
    const { mint: nonFungibleMint, tokenAccount: nonFungibleTokenAccount } =
      await mintOne2022Nft(
        { name, symbol: name, uri },
        connection,
        benificiary,
        adminKeypair,
        adminKeypair,
        deployment
      );

    const [hashlistMarker] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("hashlist_marker"),
        deployment.toBuffer(),
        nonFungibleMint.publicKey.toBuffer(),
      ],
      libreplexFairLaunchProgram.programId
    );

    sig = await libreplexFairLaunchProgram.methods
      .join({
        multiplierDenominator: 1,
        multiplierNumerator: 1,
      })
      .accounts({
        deployment,
        deploymentConfig,
        creatorFeeTreasury: adminKeypair.publicKey,
        hashlist,
        hashlistMarker,
        payer: adminKeypair.publicKey,
        signer: adminKeypair.publicKey,
        fungibleMint: fungibleMint.publicKey,
        nonFungibleMint: nonFungibleMint.publicKey,
        nonFungibleTokenAccount,
        nonFungibleTokenAccountOwner: benificiary,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .preInstructions([
        web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: 500_000,
        }),
      ])
      .signers([nonFungibleMint, userKeypair])
      .rpc({ skipPreflight: true });

    data.push({
      nonFungibleMint: nonFungibleMint.publicKey,
      hashlistMarker,
      nonFungibleTokenAccount,
    });
  }

  return {
    deployment,
    deploymentConfig,
    hashlist,
    fungibleMint: fungibleMint.publicKey,
    fungibleEscrowTokenAccount,
    data,
  };
};
