console.warn = () => { }; // Suppresses console.warn from web3.js

import {
  BadgesCondition,
  Profile,
  ProfileInfoInput,
  Project,
  User,
  UserInfoInput,
} from "@honeycomb-protocol/edge-client";
import {
  authorize,
  client,
  createProject,
  sendTransaction,
  userKeypair,
} from "../../utils";
import { Keypair } from "@solana/web3.js";

describe("Hive Control Users n Profiles", () => {
  let user: User;
  let accessToken: string;
  let project: Project;
  let profile: Profile;

  const userInfo: UserInfoInput = {
    // username: "hcDev",
    name: "Honeycomb Developer",
    bio: "This user is created for testing purposes",
    pfp: "https://lh3.googleusercontent.com/-Jsm7S8BHy4nOzrw2f5AryUgp9Fym2buUOkkxgNplGCddTkiKBXPLRytTMXBXwGcHuRr06EvJStmkHj-9JeTfmHsnT0prHg5Mhg",
  };

  const profileInfo: ProfileInfoInput = {
    name: `(Profile) ${userInfo.name}`,
    bio: `This is profile of ${userInfo.name}`,
    pfp: "https://lh3.googleusercontent.com/-Jsm7S8BHy4nOzrw2f5AryUgp9Fym2buUOkkxgNplGCddTkiKBXPLRytTMXBXwGcHuRr06EvJStmkHj-9JeTfmHsnT0prHg5Mhg",
  };

  beforeAll(async () => {
    project = await createProject();
  });

  it("Creates/Loads User with Profile", async () => {
    user = await client
      .findUsers({
        wallets: [userKeypair.publicKey.toString()],
      })
      .then(({ user: [user] }) => user);

    if (!user) {
      const { createNewUserWithProfileTransaction: txResponse } =
        await client.createNewUserWithProfileTransaction({
          userInfo,
          payer: userKeypair.publicKey.toString(),
          wallet: userKeypair.publicKey.toString(),
          project: project.address,
        });

      await sendTransaction(
        txResponse,
        [userKeypair],
        "createNewUserTransaction"
      );

      user = await client
        .findUsers({
          wallets: [userKeypair.publicKey.toString()],
        })
        .then(({ user: [user] }) => user);

      expect(user).toBeTruthy();
      // expect(user.info.username).toBe(userInfo.username);
      expect(user.info.name).toBe(userInfo.name);
      expect(user.info.bio).toBe(userInfo.bio);
      expect(user.info.pfp).toBe(userInfo.pfp);
    }
    if (!accessToken) accessToken = await authorize();

    profile = await client
      .findProfiles({
        userIds: [user.id],
        projects: [project.address],
      })
      .then(({ profile: [profile] }) => profile);

    if (profile) {
      // If profile already exists, check if it matches the user info (since we are using the same info for both in createNewUserWithProfileTransaction) 
      expect(profile).toBeTruthy();
      expect(profile.info.name).toBe(userInfo.name);
      expect(profile.info.bio).toBe(userInfo.bio);
      expect(profile.info.pfp).toBe(userInfo.pfp);
      return;
    } else {
      // Otherwise create a new profile with its own info
      if (!accessToken) throw new Error(`Access token not created`);
      const { createNewProfileTransaction: txResponse } =
        await client.createNewProfileTransaction(
          {
            project: project.address,
            info: profileInfo,
            payer: userKeypair.publicKey.toString(),
          },
          {
            fetchOptions: !accessToken
              ? {}
              : {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
              },
          }
        );
  
      await sendTransaction(
        txResponse,
        [userKeypair],
        "createNewProfileTransaction"
      );
  
      // Fetch the new profile to check if it was created successfully
      profile = await client
        .findProfiles({
          userIds: [user.id],
          projects: [project.address],
        })
        .then(({ profile: [profile] }) => profile);
  
      expect(profile).toBeTruthy();
      expect(profile.info.name).toBe(profileInfo.name);
      expect(profile.info.bio).toBe(profileInfo.bio);
      expect(profile.info.pfp).toBe(profileInfo.pfp);
    }
  });

  it("Update Profile", async () => {
    const name = user.info.name + "_profile";
    const { createUpdateProfileTransaction: txResponse } =
      await client.createUpdateProfileTransaction(
        {
          profile: profile.address,
          info: {
            name,
          },
          customData: {
            add: {
              customField: ["customValue"],
            }
          },
          payer: userKeypair.publicKey.toString(),
        },
        {
          fetchOptions: !accessToken
            ? {}
            : {
              headers: {
                authorization: `Bearer ${accessToken}`,
              },
            },
        }
      );

    await sendTransaction(
      txResponse,
      [userKeypair],
      "createUpdateProfileTransaction"
    );

    await client
      .findProfiles({
        userIds: [user.id],
        projects: [project.address],
      })
      .then(({ profile: [profileT] }) => (profile = profileT));

    expect(profile).toBeTruthy();
    expect(profile.info.name).toBe(name);
    // expect(profile.customData.customField[0]).toBe("customValue");
  });

  it("Add Wallet", async () => {
    const newPublicKey = Keypair.generate().publicKey.toString();
    const { createUpdateUserTransaction: txResponse } =
      await client.createUpdateUserTransaction(
        {
          payer: userKeypair.publicKey.toString(),
          populateCivic: true,
          wallets: {
            add: [newPublicKey],
          },
        },
        {
          fetchOptions: !accessToken
            ? {}
            : {
              headers: {
                authorization: `Bearer ${accessToken}`,
              },
            },
        }
      );

    await sendTransaction(txResponse, [userKeypair], "Update Social Info");

    await client
      .findUsers({
        wallets: [userKeypair.publicKey.toString()],
      })
      .then(({ user: [userT] }) => (user = userT));

    expect(user).toBeTruthy();
    expect(user.wallets.wallets).toContain(newPublicKey);
  });

  it("Remove Wallet", async () => {
    const { createUpdateUserTransaction: txResponse } =
      await client.createUpdateUserTransaction(
        {
          payer: userKeypair.publicKey.toString(),
          wallets: {
            remove: user.wallets.wallets.slice(1),
          },
        },
        {
          fetchOptions: !accessToken
            ? {}
            : {
              headers: {
                authorization: `Bearer ${accessToken}`,
              },
            },
        }
      );

    await sendTransaction(txResponse, [userKeypair], "Update User Info");

    await client
      .findUsers({
        wallets: [userKeypair.publicKey.toString()],
      })
      .then(({ user: [userT] }) => (user = userT));

    expect(user).toBeTruthy();
    expect(user.wallets.wallets).toHaveLength(1);
    expect(user.wallets.wallets).toContain(userKeypair.publicKey.toBase58());
  });

  it("Claim Badge Criteria", async () => {
    const { createClaimBadgeCriteriaTransaction: txResponse } =
      await client.createClaimBadgeCriteriaTransaction({
        args: {
          criteriaIndex: 0,
          profileAddress: profile.address,
          projectAddress: project.address,
          proof: BadgesCondition.Public,
          payer: userKeypair.publicKey.toString(),
        },
      });

    await sendTransaction(
      txResponse,
      [userKeypair],
      "createClaimBadgeCriteriaTransaction"
    );

    profile = await client
      .findProfiles({ userIds: [profile.userId], projects: [project.address] })
      .then((res) => res.profile[0]);

    expect(profile.platformData.achievements).toBeTruthy();
  });
});
