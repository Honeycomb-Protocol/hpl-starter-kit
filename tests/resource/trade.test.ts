console.warn = () => {} // Suppresses console.warn from web3.js

import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    AuthorityType,
    createInitializeMetadataPointerInstruction,
    createInitializeMintCloseAuthorityInstruction,
    createInitializeMintInstruction,
    createInitializePermanentDelegateInstruction,
    ExtensionType,
    getMintLen,
    getOrCreateAssociatedTokenAccount,
    LENGTH_SIZE,
    mintTo,
    setAuthority,
    TOKEN_2022_PROGRAM_ID,
    TYPE_SIZE,
} from "@solana/spl-token";
import { createInitializeInstruction, pack } from "@solana/spl-token-metadata";
import {
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction,
} from "@solana/web3.js";
import { Project, ResourceStorageEnum } from "@honeycomb-protocol/edge-client";
import {
    adminKeypair,
    client,
    connection,
    createProject,
    log,
    sendTransaction,
    userKeypair,
    wait,
} from "../../utils";

export async function fetchAssetByOwner(
    owner: string,
    dasRpc: string = process.env.RPC_URL!
) {
    const response = await fetch(dasRpc as string, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: "text",
            method: "getAssetsByOwner",
            params: {
                ownerAddress: owner,
                page: 1,
                limit: 100,
            },
        }),
    });
    const { result } = await response.json();

    return result;
}

const createTokenExtensionMint = async (
    extensions: ExtensionType[],
    authority: Keypair,
    params: {
        name: string;
        symbol: string;
        uri: string;
    }
) => {
    const mintKeypair = Keypair.generate();
    const metadata = {
        mint: mintKeypair.publicKey,
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
        additionalMetadata: [],
    };

    const mintLen = getMintLen(extensions);
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
    const lamports = await connection.getMinimumBalanceForRentExemption(
        mintLen + metadataLen
    );

    const transaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: adminKeypair.publicKey,
            newAccountPubkey: metadata.mint,
            space: mintLen,
            lamports,
            programId: TOKEN_2022_PROGRAM_ID,
        })
    );

    // add mint instructions
    if (extensions.includes(ExtensionType.MintCloseAuthority))
        transaction.add(
            createInitializeMintCloseAuthorityInstruction(
                metadata.mint,
                authority.publicKey,
                TOKEN_2022_PROGRAM_ID
            )
        );

    // add permanent delegate instructions
    if (extensions.includes(ExtensionType.PermanentDelegate))
        transaction.add(
            createInitializePermanentDelegateInstruction(
                metadata.mint,
                authority.publicKey,
                TOKEN_2022_PROGRAM_ID
            )
        );

    // add metadata pointer instructions
    if (extensions.includes(ExtensionType.MetadataPointer))
        transaction.add(
            createInitializeMetadataPointerInstruction(
                metadata.mint,
                authority.publicKey,
                metadata.mint,
                TOKEN_2022_PROGRAM_ID
            )
        );

    // add mint instructions
    transaction.add(
        createInitializeMintInstruction(
            metadata.mint,
            6,
            authority.publicKey,
            authority.publicKey,
            TOKEN_2022_PROGRAM_ID
        )
    );

    // add metadata instructions
    transaction.add(
        createInitializeInstruction({
            programId: TOKEN_2022_PROGRAM_ID,
            mint: metadata.mint,
            metadata: metadata.mint,
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri,
            mintAuthority: authority.publicKey,
            updateAuthority: authority.publicKey,
        })
    );

    await sendAndConfirmTransaction(
        connection,
        transaction,
        [adminKeypair, mintKeypair],
        {
            skipPreflight: false,
            commitment: "confirmed",
        }
    );

    return mintKeypair;
};

const mintTokensAndRevokeMintAuthority = async (mint: PublicKey) => {
    // creating an associated token account
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        adminKeypair,
        mint,
        adminKeypair.publicKey,
        false,
        "confirmed",
        {
            commitment: "confirmed",
            skipPreflight: true,
        },
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // minting tokens into the account
    await mintTo(
        connection,
        adminKeypair,
        mint,
        tokenAccount.address,
        adminKeypair.publicKey,
        1000000 * 10 ** 6,
        [],
        {
            commitment: "confirmed",
            skipPreflight: true,
        },
        TOKEN_2022_PROGRAM_ID
    );

    // revoking permanent delegate authority
    await setAuthority(
        connection,
        adminKeypair,
        mint,
        adminKeypair.publicKey,
        AuthorityType.PermanentDelegate,
        null,
        [],
        {
            commitment: "confirmed",
            skipPreflight: true,
        },
        TOKEN_2022_PROGRAM_ID
    );

    // revoking mint close authority
    await setAuthority(
        connection,
        adminKeypair,
        mint,
        adminKeypair.publicKey,
        AuthorityType.CloseMint,
        null,
        [],
        {
            commitment: "confirmed",
            skipPreflight: true,
        },
        TOKEN_2022_PROGRAM_ID
    );
};

describe("import & export account state resource", () => {
    let projectAddress: string;
    let resourceAddresses: string[] = [];
    let mints: {
        address: string;
        isLedger: boolean;
        isRevoked: boolean;
    }[] = [];

    let project: Project;

    beforeAll(async () => {
        if (!projectAddress) {
            project = await createProject(
                undefined,
                undefined,
                undefined,
                true,
                false,
                false
            );

            log("created project", project.address);
            projectAddress = project.address;
        } else {
            project = await client
                .findProjects({ addresses: [projectAddress] })
                .then(({ project }) => project[0]);
        }

        // create a token22 mint account
        if (!mints.length) {
            for (let i = 0; i < 4; i++) {
                const mintKeypair = await createTokenExtensionMint(
                    [
                        ExtensionType.MintCloseAuthority,
                        ExtensionType.PermanentDelegate,
                        ExtensionType.MetadataPointer,
                    ],
                    adminKeypair,
                    {
                        name: "Bonk",
                        symbol: "TST",
                        uri: "https://example.com",
                    }
                );

                mints.push({
                    address: String(mintKeypair.publicKey),
                    isLedger: false,
                    isRevoked: false,
                });
            }

            if (!mints.length) throw new Error(`Mint not created`);

            // mint tokens and revoke mint authority
            await mintTokensAndRevokeMintAuthority(new PublicKey(mints[1].address));
            mints[1].isRevoked = true;

            mints[2].isLedger = true;

            await mintTokensAndRevokeMintAuthority(new PublicKey(mints[3].address));
            mints[3].isRevoked = true;
            mints[3].isLedger = true;

            log("created mints", mints);
        }
    });

    it("import fungible resources", async () => {
        if (!project) throw new Error(`Project not created`);
        if (!mints.length) throw new Error(`Mint not created`);

        if (!resourceAddresses.length) {
            for (const mint of mints) {
                const {
                    createImportFungibleResourceTransaction: {
                        resource: resourceAddress,
                        tx: importResourceTx,
                    },
                } = await client.createImportFungibleResourceTransaction({
                    params: {
                        decimals: 6,
                        mint: mint.address,
                        project: projectAddress,
                        authority: adminKeypair.publicKey.toBase58(),
                        storage: mint.isLedger
                            ? ResourceStorageEnum.LedgerState
                            : ResourceStorageEnum.AccountState,
                        custody: mint.isRevoked
                            ? {
                                supply: String(1000000 * 10 ** 6),
                            }
                            : undefined,
                    },
                });

                await sendTransaction(
                    importResourceTx,
                    [adminKeypair],
                    "ImportFungibleResourceTransaction"
                );

                resourceAddresses.push(resourceAddress);

                // if ledger state, create a resource tree
                if (mint.isLedger) {
                    const {
                        createCreateNewResourceTreeTransaction: { tx, treeAddress },
                    } = await client.createCreateNewResourceTreeTransaction({
                        resource: resourceAddress,
                        project: projectAddress,
                        authority: adminKeypair.publicKey.toString(),
                        treeConfig: {
                            advanced: {
                                maxDepth: 3,
                                maxBufferSize: 8,
                                canopyDepth: 2,
                            },
                        },
                    });

                    await sendTransaction(
                        tx,
                        [adminKeypair],
                        "createCreateNewResourceTreeTransaction" + resourceAddress
                    );

                    log("created resource tree", treeAddress);
                }
            }

            await wait(7);
        }

        console.log("resourceAddresses", resourceAddresses);
        const { resources } = await client.findResources({
            projects: [projectAddress],
            addresses: resourceAddresses,
        });

        expect(resources).toHaveLength(mints.length);
        resources.forEach((resource) => {
            expect(resource).toBeTruthy();
            expect(resource.project).toBe(projectAddress);
        });
    });

    it("mint the imported resources", async () => {
        if (!project) throw new Error(`Project not created`);
        if (!resourceAddresses.length) throw new Error(`Resource not created`);

        for (const resourceAddress of resourceAddresses) {
            const { createMintResourceTransaction: mintResourceTx } =
                await client.createMintResourceTransaction({
                    resource: resourceAddress,
                    authority: adminKeypair.publicKey.toBase58(),
                    owner: userKeypair.publicKey.toBase58(),
                    amount: String(1000 * 10 ** 6),
                });

            await sendTransaction(
                mintResourceTx,
                [adminKeypair],
                "MintFungibleResourceTransaction"
            );

            log("minted resource", resourceAddress);
        }
    });

    it("burn the resources ", async () => {
        if (!project) throw new Error(`Project not created`);
        if (!resourceAddresses.length) throw new Error(`Resource not created`);

        for (const resourceAddress of resourceAddresses) {
            const { createBurnResourceTransaction: burnResourceTx } =
                await client.createBurnResourceTransaction({
                    resource: resourceAddress,
                    authority: userKeypair.publicKey.toBase58(),
                    amount: String(100 * 10 ** 6),
                });

            await sendTransaction(
                burnResourceTx,
                [userKeypair],
                "BurnFungibleResourceTransaction"
            );

            log("burned resource", resourceAddress);
        }
    });

    it("export fungible resources", async () => {
        if (!project) throw new Error(`Project not created`);
        if (!resourceAddresses.length) throw new Error(`Resource not created`);

        for (let i = 0; i < resourceAddresses.length; i++) {
            if (i === 2) break;

            const { createExportFungibleResourceTransaction: exportResourceTx } =
                await client.createExportFungibleResourceTransaction({
                    resource: resourceAddresses[i],
                    authority: adminKeypair.publicKey.toBase58(),
                });

            await sendTransaction(
                exportResourceTx,
                [adminKeypair],
                "ExportFungibleResourceTransaction"
            );

            log("exported resource", resourceAddresses[i]);
        }

        // await wait(7);
        // const resources = await client.findResources({
        //     projects: [projectAddress],
        //     addresses: resourceAddresses.splice(0, 2),
        // });

        // expect(resources.resources).toHaveLength(2);
        // resources.resources.forEach((resource) => {
        //     expect(resource).toBeTruthy();
        //     expect(resource.project).toBe(projectAddress);
        //     expect(resource.kind.kind).toBe("Exported");
        // });
    });
});
