import { run, ethers, network } from "hardhat"
import { setupFiles, writeABI, writeFiles } from "./setup-files"
import { encodeBytes32String } from "ethers"

setupFiles()

const TOKENS = [
    { name: "USD Coin", symbol: "USDC" },
    { name: "Tether USD", symbol: "USDT" },
    { name: "DAI", symbol: "DAI" }
]
const INIT_LEAF = encodeBytes32String("")
const BLOCKS = 2

async function deployGroth16() {
    const MockERC20 = await ethers.getContractFactory("Groth16Verifier")
    await MockERC20.deploy()
}

async function deploy() {
    const { name, config } = network
    const { chainId } = config

    console.log(name.toUpperCase())

    const MockERC20 = await ethers.getContractFactory("MockERC20")
    const PoseidonT2 = await ethers.getContractFactory("PoseidonT2")
    const PoseidonT3 = await ethers.getContractFactory("PoseidonT3")
    
    console.log("Deploying libraries...")
    const poseidonT2 = await PoseidonT2.deploy()
    const poseidonT3 = await PoseidonT3.deploy()
    console.log("Deployed libraries.")

    const poseidonT2Address = await poseidonT2.getAddress()
    const poseidonT3Address = await poseidonT3.getAddress()
    
    const Main = await ethers.getContractFactory("Main", {
        libraries: {
            PoseidonT2: poseidonT2Address,
            PoseidonT3: poseidonT3Address
        }
    })
    
    writeABI(Main.interface.fragments)

    console.log("Deploying main contract...")
    const main = await Main.deploy(INIT_LEAF)
    await main.deploymentTransaction()?.wait(BLOCKS)
    const mainAddress = await main.getAddress()
    console.log("Deployed main contract")

    await run("verify:verify", {
        address: mainAddress,
        constructorArguments: [INIT_LEAF]
    })

    const tokens: Record<string, string> = {}

    console.log("Deploying tokens...")
    for (const { name, symbol } of TOKENS) {
        const token = await MockERC20.deploy(name, symbol)
        await token.deploymentTransaction()?.wait(BLOCKS)
        const tokenAddress = await token.getAddress()
        tokens[symbol.toLowerCase()] = tokenAddress

        await run("verify:verify", {
            address: tokenAddress,
            constructorArguments: [name, symbol]
        })
    }
    console.log("Deployed tokens...")

    const addressAndTokens = {
        address: mainAddress,
        ...tokens
    }

    writeFiles(chainId!, addressAndTokens)
}

deployGroth16().then(function () {
    console.log("Deployment finished!")
    process.exit(0)
}).catch(function (err: any) {
    console.log(err)
})