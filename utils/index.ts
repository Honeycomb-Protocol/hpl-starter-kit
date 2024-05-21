import * as web3 from "@solana/web3.js";
import {
    PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
    TokenProgramVersion,
    createCreateTreeInstruction,
    createMintToCollectionV1Instruction,
  } from "@metaplex-foundation/mpl-bubblegum";

export async function createNewTree(
    connection: web3.Connection,
    signer: web3.Keypair
) {
    const merkleTree = web3.Keypair.generate();

    const [treeAuthority, _bump] = web3.PublicKey.findProgramAddressSync(
        [merkleTree.publicKey.toBuffer()],
        BUBBLEGUM_PROGRAM_ID
    );

    const depthSizePair: ValidDepthSizePair = {
        maxDepth: 3,
        maxBufferSize: 8,
    };
    const space = getConcurrentMerkleTreeAccountSize(
        depthSizePair.maxDepth,
        depthSizePair.maxBufferSize
    );

    const tx = new web3.Transaction().add(
        web3.SystemProgram.createAccount({
            newAccountPubkey: merkleTree.publicKey,
            fromPubkey: signer.publicKey,
            space: space,
            lamports: await connection.getMinimumBalanceForRentExemption(space),
            programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        }),
        createCreateTreeInstruction(
            {
                merkleTree: merkleTree.publicKey,
                treeAuthority: treeAuthority,
                payer: signer.publicKey,
                treeCreator: signer.publicKey,
                compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
                logWrapper: SPL_NOOP_PROGRAM_ID,
                systemProgram: web3.SystemProgram.programId,
            },
            {
                maxDepth: depthSizePair.maxDepth,
                maxBufferSize: depthSizePair.maxBufferSize,
                public: false,
            }
        )
    );

    const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = signer.publicKey;

    tx.sign(merkleTree, signer);

    const signature = await connection.sendRawTransaction(tx.serialize());

    await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
    });

    return [merkleTree.publicKey, signature] as [web3.PublicKey, string];
}

export async function mintOneCNFT(
    connection: web3.Connection,
    signer: web3.Keypair,
    {
        dropWalletKey,
        name,
        symbol,
        uri,
        merkleTree,
        collectionMint,
    }: {
        dropWalletKey: web3.PublicKey;
        name: string;
        symbol: string;
        uri: string;
        merkleTree: web3.PublicKey;
        collectionMint: web3.PublicKey;
    }
) {
    try {
        const [treeAuthority, _bump] = web3.PublicKey.findProgramAddressSync(
            [merkleTree.toBuffer()],
            BUBBLEGUM_PROGRAM_ID
        );

        const [collectionMetadataAccount, _b1] =
            web3.PublicKey.findProgramAddressSync(
                [
                    Buffer.from("metadata", "utf8"),
                    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                    collectionMint.toBuffer(),
                ],
                TOKEN_METADATA_PROGRAM_ID
            );
        const [collectionEditionAccount, _b2] =
            web3.PublicKey.findProgramAddressSync(
                [
                    Buffer.from("metadata", "utf8"),
                    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                    collectionMint.toBuffer(),
                    Buffer.from("edition", "utf8"),
                ],
                TOKEN_METADATA_PROGRAM_ID
            );
        const [bgumSigner, __] = web3.PublicKey.findProgramAddressSync(
            [Buffer.from("collection_cpi", "utf8")],
            BUBBLEGUM_PROGRAM_ID
        );

        const tx = new web3.Transaction().add(
            createMintToCollectionV1Instruction(
                {
                    treeAuthority: treeAuthority,
                    leafOwner: dropWalletKey,
                    leafDelegate: dropWalletKey,
                    merkleTree,
                    payer: signer.publicKey,
                    treeDelegate: signer.publicKey,
                    logWrapper: SPL_NOOP_PROGRAM_ID,
                    compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
                    collectionAuthority: signer.publicKey,
                    collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
                    collectionMint: collectionMint,
                    collectionMetadata: collectionMetadataAccount,
                    editionAccount: collectionEditionAccount,
                    bubblegumSigner: bgumSigner,
                    tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
                },
                {
                    metadataArgs: {
                        collection: { key: collectionMint, verified: false },
                        creators: [
                            {
                                address: signer.publicKey,
                                verified: false,
                                share: 100,
                            },
                        ],
                        isMutable: true,
                        name,
                        primarySaleHappened: true,
                        sellerFeeBasisPoints: 500,
                        symbol,
                        uri,
                        uses: null,
                        tokenStandard: null,
                        editionNonce: null,
                        tokenProgramVersion: TokenProgramVersion.Original,
                    },
                }
            )
        );

        const { blockhash, lastValidBlockHeight } =
            await connection.getLatestBlockhash();

        tx.recentBlockhash = blockhash;
        tx.lastValidBlockHeight = lastValidBlockHeight;
        tx.feePayer = signer.publicKey;

        tx.sign(signer);

        const signature = await connection.sendRawTransaction(tx.serialize());

        await connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight,
        });

        return {
            txHash: signature,
            wallet: dropWalletKey,
            name,
            error: false,
            message: "Success",
        };
    } catch (e) {
        throw new Error(e);
    }
}