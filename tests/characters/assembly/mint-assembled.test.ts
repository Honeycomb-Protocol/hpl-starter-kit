import { wait } from "@honeycomb-protocol/hive-control";
import { PublicKey } from "@solana/web3.js";
import {
  AssemblerConfig,
  Character,
  CharacterModel,
  MintAsKind,
  Project,
} from "@honeycomb-protocol/edge-client";
// import { fetchDasAssets } from "../../../edge/utils/asset";
import {
  adminKeypair,
  client,
  connection,
  createAssemblerConfig,
  createCharacterModelRaw,
  createProject,
  fetchHeliusAssets,
  RPC_URL,
  sendTransaction,
  sendTransactions,
  userKeypair,
} from "../../../utils";
import { traits, order } from "./traits";

const refetchCharacter = async (
  characterModel: CharacterModel,
  shoudldWait = true
) => {
  shoudldWait && (await wait(2));
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

describe("Test Assembled Character Minting as different assets", () => {
  let project: Project;

  const assembleAndUnwrapCharacter = async (
    assemblerConfig: AssemblerConfig,
    characterModel: CharacterModel
  ) => {
    const preAssembleBalance = await connection.getBalance(
      userKeypair.publicKey
    );
    // expect(preAssembleBalance).toBe(postAssembleBalance);

    const { createAssembleCharacterTransaction } =
      await client.createAssembleCharacterTransaction({
        attributes: [
          ["Fur", "Black"],
          ["Eyes", "2 Tone"],
          ["Mouth", "Agitated"],
          ["Clothes", "Astronaut"],
        ],
        project: project.address,
        assemblerConfig: assemblerConfig.address,
        characterModel: characterModel.address,
        wallet: userKeypair.publicKey.toString(),
      });

    await sendTransaction(
      createAssembleCharacterTransaction,
      [userKeypair],
      "createAssembleCharacterTransaction"
    );
    const postAssembleBalance = await connection.getBalance(
      userKeypair.publicKey
    );
    // expect(postAssembleBalance).toBe(postUnwrapBalance);

    let character = await refetchCharacter(characterModel);

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

    character = await refetchCharacter(characterModel);
    expect(character.usedBy.kind).toBe("Ejected");

    return character;
  };

  beforeAll(async () => {
    project = await createProject();
  });

  it("Assemble Character and Mint as MplCore", async () => {
    const assemblerConfig = await createAssemblerConfig(project, order, traits);
    const characterModel = await createCharacterModelRaw(
      project,
      {
        kind: "Assembled",
        assemblerConfigInput: {
          assemblerConfig: assemblerConfig.address,
          name: "MplCore #0",
          symbol: "MPL_CORE",
          description: "Creating this MplCore Asset with assembler",
          creators: [
            {
              address: adminKeypair.publicKey.toString(),
              share: 100,
            },
          ],
          sellerFeeBasisPoints: 0,
          collectionName: "Collection",
        },
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

    const character = await assembleAndUnwrapCharacter(
      assemblerConfig,
      characterModel
    );

    const [asset] = await fetchHeliusAssets(
      {
        mintList: [new PublicKey(character.source.params.mint)],
      },
    );

    expect(asset.interface).toBe("MplCoreAsset");
  });

  it("Assemble Character and Mint as MplMetadata", async () => {
    const assemblerConfig = await createAssemblerConfig(project, order, traits);
    const characterModel = await createCharacterModelRaw(
      project,
      {
        kind: "Assembled",
        assemblerConfigInput: {
          assemblerConfig: assemblerConfig.address,
          name: "MplMetadata #0",
          symbol: "NFT",
          description: "Creating this NFT with assembler",
          creators: [
            {
              address: adminKeypair.publicKey.toString(),
              share: 100,
            },
          ],
          sellerFeeBasisPoints: 0,
          collectionName: "Collection",
        },
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

    const character = await assembleAndUnwrapCharacter(
      assemblerConfig,
      characterModel
    );

    const [asset] = await fetchHeliusAssets(
      {
        mintList: [new PublicKey(character.source.params.mint)],
      },
    );
    expect(asset.interface).toBe("V1_NFT");
  });

  it("Assemble Character and Mint as MplBubblegum", async () => {
    const assemblerConfig = await createAssemblerConfig(project, order, traits);

    const characterModel = await createCharacterModelRaw(
      project,
      {
        kind: "Assembled",
        assemblerConfigInput: {
          assemblerConfig: assemblerConfig.address,
          name: "MplBubblegum #0",
          symbol: "CNFT",
          description: "Creating this NFT with assembler",
          creators: [
            {
              address: adminKeypair.publicKey.toString(),
              share: 100,
            },
          ],
          sellerFeeBasisPoints: 0,
          collectionName: "Collection",
        },
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

    const character = await assembleAndUnwrapCharacter(
      assemblerConfig,
      characterModel
    );

    // const [asset] = await fetchDasAssets(
    //   {
    //     mintList: [new PublicKey(character.source.params.mint)],
    //   },
    //   RPC_URL
    // );
    // expect(asset.isCompressed).toBeTruthy();
  });
});
