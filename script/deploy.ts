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
const BLOCKS = 5

async function deployGroth16() {
    console.log("Deploying Groth16 library...")
    const Groth16Verifier = await ethers.getContractFactory("Groth16Verifier")
    const groth16Verifier = await Groth16Verifier.deploy()
    await groth16Verifier.deploymentTransaction()?.wait(BLOCKS)
    const groth16VerifierAddress = await groth16Verifier.getAddress()
    console.log("Deployed Groth16 libaray, verifying...")

    await run("verify:verify", {
        address: groth16VerifierAddress,
        constructorArguments: []
    })

    console.log("Verified Groth16 library.")

    return groth16VerifierAddress
}

async function deployPoseidonLibraries() {
    const PoseidonT2 = await ethers.getContractFactory("PoseidonT2")
    const PoseidonT3 = await ethers.getContractFactory("PoseidonT3")
    const PoseidonT4 = await ethers.getContractFactory("PoseidonT4")

    console.log("Deploying libraries...")
    const poseidonT2 = await PoseidonT2.deploy()
    await poseidonT2.deploymentTransaction()?.wait(BLOCKS)
    console.log("Deployed PoseidonT2.")

    const poseidonT3 = await PoseidonT3.deploy()
    await poseidonT3.deploymentTransaction()?.wait(BLOCKS)
    console.log("Deployed PoseidonT3.")

    const poseidonT4 = await PoseidonT4.deploy()
    await poseidonT4.deploymentTransaction()?.wait(BLOCKS)
    console.log("Deployed PoseidonT4.")
    console.log("Deployed libraries.")

    const poseidonT2Address = await poseidonT2.getAddress()
    const poseidonT3Address = await poseidonT3.getAddress()
    const poseidonT4Address = await poseidonT4.getAddress()

    return [poseidonT2Address, poseidonT3Address, poseidonT4Address]
}

async function deploy() {
    const { name, config } = network
    const { chainId } = config

    console.log(name.toUpperCase())

    const groth16VerifierAddress = await deployGroth16()
    const [poseidonT2Address, poseidonT3Address, poseidonT4Address] = await deployPoseidonLibraries()

    const MockERC20 = await ethers.getContractFactory("MockERC20")

    const Main = await ethers.getContractFactory("Main", {
        libraries: {
            PoseidonT2: poseidonT2Address,
            PoseidonT3: poseidonT3Address,
            PoseidonT4: poseidonT4Address
        }
    })

    writeABI(Main.interface.fragments)

    console.log("Deploying Main contract...")

    const main = await Main.deploy(INIT_LEAF, groth16VerifierAddress)
    await main.deploymentTransaction()?.wait(BLOCKS)
    const mainAddress = await main.getAddress()
    console.log("Deployed Main contract, verifying...")

    await run("verify:verify", {
        address: mainAddress,
        constructorArguments: [INIT_LEAF, groth16VerifierAddress],
        libraries: {
            PoseidonT2: poseidonT2Address,
            PoseidonT3: poseidonT3Address,
            PoseidonT4: poseidonT4Address
        }
    })

    console.log("Verified Main contract.")

    const tokens: Record<string, string> = {}

    console.log("Deploying tokens...")
    for (const { name, symbol } of TOKENS) {
        const token = await MockERC20.deploy(name, symbol)
        await token.deploymentTransaction()?.wait(BLOCKS)
        const tokenAddress = await token.getAddress()
        tokens[symbol.toLowerCase()] = tokenAddress

        // await run("verify:verify", {
        //     address: tokenAddress,
        //     constructorArguments: [name, symbol]
        // })
    }

    const addresses = {
        address: mainAddress,
        ...tokens
    }
    console.log("Deployed all tokens.")

    writeFiles(chainId!, addresses)
}

deploy().then(function () {
    console.log("Deployment finished!")
    process.exit(0)
}).catch(function (err: any) {
    console.log(err)
})