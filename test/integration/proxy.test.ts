import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PROXY_ABI } from "../../lib/botchain/abi";
import { createInitialPollState, applyAction } from "../../lib/proxy";

const ANVIL_PORT = 8663;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;

const localChain = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
});

describe("Proxy Integration Test (Spec §5)", () => {
  let anvil: ChildProcess;

  const asker = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const voterA = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const voterB = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
  const voterC = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
  const voterD = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");
  const voterE = privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");

  const publicClient = createPublicClient({
    chain: localChain,
    transport: http(RPC_URL),
  });

  const clientAsker = createWalletClient({ account: asker, chain: localChain, transport: http(RPC_URL) });
  const clientA = createWalletClient({ account: voterA, chain: localChain, transport: http(RPC_URL) });
  const clientB = createWalletClient({ account: voterB, chain: localChain, transport: http(RPC_URL) });
  const clientC = createWalletClient({ account: voterC, chain: localChain, transport: http(RPC_URL) });
  const clientD = createWalletClient({ account: voterD, chain: localChain, transport: http(RPC_URL) });
  const clientE = createWalletClient({ account: voterE, chain: localChain, transport: http(RPC_URL) });

  let proxyAddress: `0x${string}`;

  beforeAll(async () => {
    anvil = spawn("anvil", ["-p", String(ANVIL_PORT)], { stdio: "ignore" });

    for (let i = 0; i < 30; i++) {
      try {
        await publicClient.getBlockNumber();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const deployer = spawn(
      "forge",
      [
        "create",
        "contracts/src/Proxy.sol:Proxy",
        "--rpc-url",
        RPC_URL,
        "--private-key",
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        "--broadcast",
      ],
      { cwd: process.cwd() }
    );

    let output = "";
    deployer.stdout.on("data", (d) => (output += d.toString()));
    deployer.stderr.on("data", (d) => (output += d.toString()));

    await new Promise<void>((resolve, reject) => {
      deployer.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Deploy failed: ${output}`));
      });
    });

    const match = output.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/);
    if (!match) throw new Error(`Could not find deployed address: ${output}`);
    proxyAddress = match[1] as `0x${string}`;
  }, 30000);

  afterAll(() => {
    if (anvil) anvil.kill();
  });

  it("deploys and matches reference model on long path (delegate -> delegate votes -> reclaim -> vote yourself)", async () => {
    // 1. Asker creates poll
    const question = "Which consensus mechanism?";
    const options = ["PoW", "PoS", "PoA"];
    const duration = 3600n;

    const hashCreate = await clientAsker.writeContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: "create",
      args: [question, options, duration],
    });
    await publicClient.waitForTransactionReceipt({ hash: hashCreate });

    const pollId = 1n;
    let model = createInitialPollState(asker.address, question, options, Number(duration));

    // 2. Voter C delegates to Voter B (before B votes)
    const hashDelC = await clientC.writeContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: "delegate",
      args: [pollId, voterB.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: hashDelC });
    model = applyAction(model, { type: "delegate", caller: voterC.address, to: voterB.address });

    // Check standing & tallies
    let standingB = await publicClient.readContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: "standing",
      args: [pollId, voterB.address],
    });
    expect(standingB[2]).toBe(1); // received = 1

    let talliesOnChain = await publicClient.readContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: "tallies",
      args: [pollId],
    });
    expect(talliesOnChain[0]).toBe(model.tallies[0]);
    expect(talliesOnChain[1]).toBe(model.tallies[1]);
    expect(talliesOnChain[2]).toBe(model.tallies[2]);

    // 3. Voter B votes PoS (option 1) -> weight should be 2 (B + C)
    const hashVoteB = await clientB.writeContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: "vote",
      args: [pollId, 1],
    });
    await publicClient.waitForTransactionReceipt({ hash: hashVoteB });
    model = applyAction(model, { type: "vote", caller: voterB.address, option: 1 });

    talliesOnChain = await publicClient.readContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: "tallies",
      args: [pollId],
    });
    expect(talliesOnChain[1]).toBe(2n);
    expect(talliesOnChain[1]).toBe(model.tallies[1]);

    // 4. Voter D delegates to Voter B (after B has already voted) -> weight lands immediately
    const hashDelD = await clientD.writeContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: "delegate",
      args: [pollId, voterB.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: hashDelD });
    model = applyAction(model, { type: "delegate", caller: voterD.address, to: voterB.address });

    talliesOnChain = await publicClient.readContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: "tallies",
      args: [pollId],
    });
    expect(talliesOnChain[1]).toBe(3n);
    expect(talliesOnChain[1]).toBe(model.tallies[1]);

    // 5. Voter C reclaims vote -> tallies[1] should drop from 3 to 2
    const hashRecC = await clientC.writeContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: "reclaim",
      args: [pollId],
    });
    await publicClient.waitForTransactionReceipt({ hash: hashRecC });
    model = applyAction(model, { type: "reclaim", caller: voterC.address });

    talliesOnChain = await publicClient.readContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: "tallies",
      args: [pollId],
    });
    expect(talliesOnChain[1]).toBe(2n);
    expect(talliesOnChain[1]).toBe(model.tallies[1]);

    // 6. Voter C votes PoW (option 0) directly -> tallies[0] becomes 1
    const hashVoteC = await clientC.writeContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: "vote",
      args: [pollId, 0],
    });
    await publicClient.waitForTransactionReceipt({ hash: hashVoteC });
    model = applyAction(model, { type: "vote", caller: voterC.address, option: 0 });

    talliesOnChain = await publicClient.readContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: "tallies",
      args: [pollId],
    });
    expect(talliesOnChain[0]).toBe(1n);
    expect(talliesOnChain[1]).toBe(2n);
    expect(talliesOnChain[0]).toBe(model.tallies[0]);
    expect(talliesOnChain[1]).toBe(model.tallies[1]);

    // 7. Check leader
    const leader = await publicClient.readContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: "leader",
      args: [pollId],
    });
    expect(leader[0]).toBe(1); // option 1 (PoS)
    expect(leader[1]).toBe(false); // not tied
  });
});
