import { spawn } from "node:child_process";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PROXY_ABI } from "../lib/botchain/abi.js";

const PORT = 8763;
const RPC_URL = `http://127.0.0.1:${PORT}`;

const localChain = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
});

async function main() {
  console.log(`Starting local Anvil on port ${PORT}...`);
  const anvil = spawn("anvil", ["-p", String(PORT)], { stdio: "ignore" });

  const publicClient = createPublicClient({
    chain: localChain,
    transport: http(RPC_URL),
  });

  // Wait for anvil
  for (let i = 0; i < 30; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log("Deploying Proxy contract...");
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

  await new Promise((resolve, reject) => {
    deployer.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Deploy failed: ${output}`));
    });
  });

  const match = output.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/);
  if (!match) throw new Error("Could not find address");
  const contractAddress = match[1];
  console.log(`Proxy deployed to: ${contractAddress}`);

  // Seeding roles
  const asker = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const voterA = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const voterB = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
  const voterC = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
  const voterD = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");
  const voterE = privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");
  const voterF = privateKeyToAccount("0x92db14e403b83dde342f1b4cff28ad4a5dacd884be92791f2615a9885d8679cf");
  const del1 = privateKeyToAccount("0x4bbbf8560082ea93e76d11802d9db4313f4de79a9fb60d47180403384028644d");
  const del2 = privateKeyToAccount("0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97");
  const del3 = privateKeyToAccount("0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6");

  const cAsker = createWalletClient({ account: asker, chain: localChain, transport: http(RPC_URL) });
  const cA = createWalletClient({ account: voterA, chain: localChain, transport: http(RPC_URL) });
  const cB = createWalletClient({ account: voterB, chain: localChain, transport: http(RPC_URL) });
  const cC = createWalletClient({ account: voterC, chain: localChain, transport: http(RPC_URL) });
  const cD = createWalletClient({ account: voterD, chain: localChain, transport: http(RPC_URL) });
  const cE = createWalletClient({ account: voterE, chain: localChain, transport: http(RPC_URL) });
  const cF = createWalletClient({ account: voterF, chain: localChain, transport: http(RPC_URL) });
  const cDel1 = createWalletClient({ account: del1, chain: localChain, transport: http(RPC_URL) });
  const cDel2 = createWalletClient({ account: del2, chain: localChain, transport: http(RPC_URL) });
  const cDel3 = createWalletClient({ account: del3, chain: localChain, transport: http(RPC_URL) });

  console.log("Seeding 5 polls according to spec §5...");

  // Poll 1: open with 6 voters, 2 delegations onto a voter who has voted (A) and 1 onto a voter who has not (F)
  const tx1 = await cAsker.writeContract({
    address: contractAddress,
    abi: PROXY_ABI,
    functionName: "create",
    args: ["Should we migrate treasury to L2?", ["Migrate Now", "Delay 6 Months", "Keep on L1"], 86400n],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx1 });

  await cA.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "vote", args: [1n, 0] });
  await cB.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "vote", args: [1n, 0] });
  await cC.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "vote", args: [1n, 1] });
  await cD.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "vote", args: [1n, 1] });
  await cE.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "vote", args: [1n, 2] });
  // Del1 and Del2 delegate to A (who has voted)
  await cDel1.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "delegate", args: [1n, voterA.address] });
  await cDel2.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "delegate", args: [1n, voterA.address] });
  // Del3 delegates to F (who has not voted)
  await cDel3.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "delegate", args: [1n, voterF.address] });

  // Poll 2: ending in ~10 minutes (duration 3600, wait or keep small duration)
  const tx2 = await cAsker.writeContract({
    address: contractAddress,
    abi: PROXY_ABI,
    functionName: "create",
    args: ["Adopt weekly developer office hours?", ["Yes", "No"], 3600n],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx2 });
  await cA.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "vote", args: [2n, 0] });
  await cB.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "vote", args: [2n, 0] });

  // Poll 3: ended with a clear leader (duration 3600, fast forward time)
  const tx3 = await cAsker.writeContract({
    address: contractAddress,
    abi: PROXY_ABI,
    functionName: "create",
    args: ["Protocol governance quorum threshold", ["10%", "15%", "20%"], 3600n],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx3 });
  await cA.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "vote", args: [3n, 1] });
  await cB.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "vote", args: [3n, 1] });
  await cC.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "vote", args: [3n, 1] });
  await cD.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "vote", args: [3n, 0] });

  // Poll 4: tied
  const tx4 = await cAsker.writeContract({
    address: contractAddress,
    abi: PROXY_ABI,
    functionName: "create",
    args: ["Next community call host", ["DevRel Team", "Core Research", "Community Leads"], 3600n],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx4 });
  await cA.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "vote", args: [4n, 0] });
  await cB.writeContract({ address: contractAddress, abi: PROXY_ABI, functionName: "vote", args: [4n, 1] });

  // Fast forward anvil for poll 3 and poll 4 to be ended
  await publicClient.request({
    method: "evm_increaseTime",
    params: [3650],
  });
  await publicClient.request({
    method: "evm_mine",
    params: [],
  });

  // Poll 5: new
  const tx5 = await cAsker.writeContract({
    address: contractAddress,
    abi: PROXY_ABI,
    functionName: "create",
    args: ["Should we establish an emergency security council?", ["Approve Council", "Reject", "Abstain"], 86400n * 7n],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx5 });

  console.log("Local stack ready! Running on http://127.0.0.1:" + PORT);
  console.log("Contract Address:", contractAddress);

  // Keep running
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
