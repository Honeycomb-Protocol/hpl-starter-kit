import {
  Character,
  CharacterModel,
  MintAsKind,
  Project,
} from "@honeycomb-protocol/edge-client";
import {
  adminKeypair,
  client,
  connection,
  createCharacterModelRaw,
  createProject,
  sendTransaction,
  sendTransactions,
  umi,
  userKeypair,
  AssetResponse,
  mintAssets,
  wait
} from "../../../utils";

const refetchCharacter = async (
  characterModel: CharacterModel,
  shoudldWait = true
) => {
  shoudldWait && (await wait(5));
  const character = await client
    .findCharacters({
      trees: [
        characterModel.merkle_trees.merkle_trees[
          characterModel.merkle_trees.active
        ],
      ],
      wallets: [userKeypair.publicKey.toString()],
    })
    .then((res) => res.character[0] as Character);

  expect(character).toBeTruthy();
  // dirLog(character, { depth: null });
  return character;
};

const totalMplCoreNfts = 1;
const totalNfts = 1;
const totalcNfts = 1;
const totalExtensionsNft = 1;

describe("Test Wrapping Prepopulated Characters with different assets", () => {
  let assets: AssetResponse = {};
  let project: Project;

  const populateWrapAndUnwrap = async (
    characterModel: CharacterModel,
    mint: string
  ) => {
    const { createPopulateCharacterTransaction } =
      await client.createPopulateCharacterTransaction({
        project: project.address,
        characterModel: characterModel.address,
        mint,
        updateAuthority: adminKeypair.publicKey.toString(),
        owner: userKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      });

    await sendTransaction(
      createPopulateCharacterTransaction,
      [adminKeypair],
      "createPopulateCharacterTransaction"
    );

    const preWrapBalance = await connection.getBalance(userKeypair.publicKey);

    let character = await refetchCharacter(characterModel);
    expect(character.usedBy.kind).toBe("Ejected");

    const { createWrapAssetsToCharacterTransactions: txResponse } =
      await client.createWrapAssetsToCharacterTransactions({
        project: project.address,
        characterModel: characterModel.address,
        wallet: userKeypair.publicKey.toString(),
        mintList: [mint],
      });

    await sendTransactions(
      txResponse,
      [userKeypair],
      "createWrapAssetsToCharacterTransactions"
    );

    const postWrapBalance = await connection.getBalance(userKeypair.publicKey);
    // expect(preWrapBalance).toBe(postWrapBalance);

    character = await refetchCharacter(characterModel);
    expect(character.usedBy.kind).toBe("None");

    const { createUnwrapAssetsFromCharacterTransactions } =
      await client.createUnwrapAssetsFromCharacterTransactions({
        characterAddresses: [character.address],
        project: project.address,
        characterModel: characterModel.address,
        wallet: userKeypair.publicKey.toString(),
      });

    await sendTransactions(
      createUnwrapAssetsFromCharacterTransactions,
      [userKeypair],
      "createUnwrapAssetsFromCharacterTransactions"
    );
    const postUnwrapBalance = await connection.getBalance(
      userKeypair.publicKey
    );
    // expect(postWrapBalance).toBe(postUnwrapBalance);

    character = await refetchCharacter(characterModel);
    expect(character.usedBy.kind).toBe("Ejected");

    return character;
  };

  beforeAll(async () => {
    assets = await mintAssets(
      umi,
      {
        cnfts: totalcNfts,
        core: totalMplCoreNfts,
        pnfts: totalNfts,
        token22: totalExtensionsNft,
      },
      userKeypair.publicKey
    );

    project = await createProject(
      undefined,
      undefined,
      undefined,
      false,
      false,
      false
    );
  });

  it("Prepolute MplCore Asset as character", async () => {
    if (!assets.core?.mints.length) return;

    const characterModel = await createCharacterModelRaw(
      project,
      {
        kind: "Wrapped",
        criterias: [
          {
            kind: "Collection",
            params: assets.core.group.toString(),
          },
        ],
      },
      {
        maxDepth: 3,
        maxBufferSize: 8,
        canopyDepth: 3,
      },
      {
        kind: MintAsKind.MplCore,
      }
    );

    const preBalance = await connection.getBalance(userKeypair.publicKey);

    await populateWrapAndUnwrap(characterModel, assets.core.mints[0]);

    const postBalance = await connection.getBalance(userKeypair.publicKey);
    // expect(preBalance).toBe(postBalance);
  });

  it("Prepolute MplMetadata Asset as character", async () => {
    if (!assets.pnfts?.mints.length) return;

    const characterModel = await createCharacterModelRaw(
      project,
      {
        kind: "Wrapped",
        criterias: [
          {
            kind: "Collection",
            params: assets.pnfts.group.toString(),
          },
        ],
      },
      {
        maxDepth: 3,
        maxBufferSize: 8,
        canopyDepth: 3,
      },
      {
        kind: MintAsKind.MplMetadata,
      }
    );

    const preBalance = await connection.getBalance(userKeypair.publicKey);

    await populateWrapAndUnwrap(characterModel, assets.pnfts.mints[0]);

    const postBalance = await connection.getBalance(userKeypair.publicKey);
  });

  it("Prepolute MplBubblegum Asset as character", async () => {
    if (!assets.cnfts?.mints.length) return;

    const characterModel = await createCharacterModelRaw(
      project,
      {
        kind: "Wrapped",
        criterias: [
          {
            kind: "Collection",
            params: assets.cnfts.group.toString(),
          },
        ],
      },
      {
        maxDepth: 3,
        maxBufferSize: 8,
        canopyDepth: 3,
      },
      {
        kind: MintAsKind.MplBubblegum,
        mplBubblegum: {
          maxDepth: 3,
          maxBufferSize: 8,
        },
      }
    );

    const preBalance = await connection.getBalance(userKeypair.publicKey);

    await populateWrapAndUnwrap(
      characterModel,
      assets.cnfts.mints[0].mint.toString()
    );

    const postBalance = await connection.getBalance(userKeypair.publicKey);
  });

  it("Prepolute Token2022 Asset as character", async () => {
    if (!assets.token22?.mints.length) return;

    const characterModel = await createCharacterModelRaw(
      project,
      {
        kind: "Wrapped",
        criterias: [
          {
            kind: "Collection",
            params: assets.token22.group.toString(),
          },
        ],
      },
      {
        maxDepth: 3,
        maxBufferSize: 8,
        canopyDepth: 3,
      },
      {
        kind: MintAsKind.TokenExtensions,
      }
    );

    const preBalance = await connection.getBalance(userKeypair.publicKey);

    await populateWrapAndUnwrap(
      characterModel,
      assets.token22.mints[0].toString()
    );

    const postBalance = await connection.getBalance(userKeypair.publicKey);
  });
});
