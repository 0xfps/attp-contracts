import { expect } from "chai"
import { ethers } from "hardhat"
import { MINT_VALUE, recipient, SECRET_KEY_LENGTH } from "../constants"
import MiniMerkleTree, { bytesToBits, generatekeys, getRandomNullifier, hashNums, PRIME, standardizeToPoseidon, toNum } from "@fifteenfigures/mini-merkle-tree"
import { Main, MockERC20 } from "../../typechain-types"
import { BigNumberish, Signer } from "ethers"
import assert from "node:assert/strict"
import Randomstring from "randomstring"
import path from "node:path"
import { getInputObjects } from "./utils/get-input-object"
import { groth16 } from "snarkjs"
import { readFileSync, writeFileSync } from "node:fs"

const verificationKeyPath = path.join(__dirname, "/artifacts/verification_key.json")
const wasmPath = path.join(__dirname, "/artifacts/main.wasm")
const zkeyPath = path.join(__dirname, "/artifacts/main2.zkey")
const inputs = path.join(__dirname, "/artifacts/input.json")

const mockPA: [BigNumberish, BigNumberish] = [BigInt(1), BigInt(2)]
const mockPB: [[BigNumberish, BigNumberish], [BigNumberish, BigNumberish]] = [[BigInt(1), BigInt(2)], [BigInt(1), BigInt(2)]]
const mockPC: [BigNumberish, BigNumberish] = [BigInt(1), BigInt(2)]

const fakeRoot = "0x12b41f94c4a330f921ab2f6a6bdf3e6df02c054e032c06673ab94b2f7eae7bb2"

describe("Withdrawal Tests", function () {
    let mainContract: Main
    let mockERC20Token: MockERC20

    let mockAsset: string
    let mainContractAddress: string

    const amount = BigInt(100000000000000000234n);
    const leaves: string[] = []

    let alice: Signer
    let aliceAddress: string

    let stdKey: string;

    const wAmount = BigInt(3e18)
    let dKey: string
    let wKey: string
    let skey: string
    let root: string
    let usedNullifier: BigInt

    before(async function () {
        alice = (await ethers.getSigners())[0]
        aliceAddress = await alice.getAddress()

        mockERC20Token = await ethers.deployContract("MockERC20")
        await mockERC20Token.mint(alice, MINT_VALUE)
        mockAsset = await mockERC20Token.getAddress()

        const PoseidonT2 = await (await ethers.deployContract("PoseidonT2")).getAddress()
        const PoseidonT3 = await (await ethers.deployContract("PoseidonT3")).getAddress()

        const initLeaf = hashNums([getRandomNullifier()])
        leaves.push(initLeaf)

        mainContract = await ethers.deployContract("Main", [initLeaf], {
            libraries: {
                PoseidonT2,
                PoseidonT3
            }
        })

        mainContractAddress = await mainContract.getAddress()

        const secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })
        const { withdrawalKey, depositKey } = generatekeys(mockAsset, amount, secretKey)
        const standardizedKey = standardizeToPoseidon(depositKey)

        const aliceETHBalanceBefore = await ethers.provider.getBalance(aliceAddress)

        await mockERC20Token.connect(alice).approve(mainContractAddress, amount)
        await mainContract.connect(alice).deposit(depositKey, standardizedKey, { value: BigInt(4e18) })

        const aliceETHBalanceAfter = await ethers.provider.getBalance(aliceAddress)
        const assumedGas = 5e15

        stdKey = standardizedKey
        wKey = withdrawalKey
        dKey = depositKey
        skey = secretKey

        leaves.push(standardizedKey)
        assert(await mainContract.root() == new MiniMerkleTree(leaves).root)
        assert((aliceETHBalanceBefore - aliceETHBalanceAfter) <= assumedGas)
    })

    it("Should revert because of inexistent root.", async function () {
        await expect(
            mainContract
                .connect(alice)
                .withdraw(
                    fakeRoot,
                    wKey,
                    mockPA,
                    mockPB,
                    mockPC,
                    getRandomNullifier(),
                    recipient,
                    wAmount
                )
        ).to.be.revertedWithCustomError(mainContract, "RootNotInHistory")
    })

    it("Should revert because withdrwal exceeds amount.", async function () {
        const root = await mainContract.root()

        await expect(
            mainContract
                .connect(alice)
                .withdraw(
                    root,
                    wKey,
                    mockPA,
                    mockPB,
                    mockPC,
                    getRandomNullifier(),
                    recipient,
                    BigInt(500e18)
                )
        ).to.be.revertedWithCustomError(mainContract, "WithdrawalExceedsMax")
    })

    it("Should fail to verify proof.", async function () {
        const root = await mainContract.root()

        await expect(
            mainContract
                .connect(alice)
                .withdraw(
                    root,
                    wKey,
                    mockPA,
                    mockPB,
                    mockPC,
                    getRandomNullifier(),
                    recipient,
                    wAmount
                )
        ).to.be.revertedWithCustomError(mainContract, "ProofNotVerified")
    })

    async function deposit() {
        const secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })
        const { withdrawalKey, depositKey } = generatekeys(mockAsset, BigInt(1e17), secretKey)
        const standardizedKey = standardizeToPoseidon(depositKey)

        const aliceETHBalanceBefore = await ethers.provider.getBalance(aliceAddress)

        await mockERC20Token.connect(alice).approve(mainContractAddress, amount)
        await mainContract.connect(alice).deposit(depositKey, standardizedKey, { value: BigInt(4e18) })

        const aliceETHBalanceAfter = await ethers.provider.getBalance(aliceAddress)
        const assumedGas = 5e15

        stdKey = standardizedKey
        wKey = withdrawalKey
        dKey = depositKey
        skey = secretKey

        leaves.push(standardizedKey)
        assert(await mainContract.root() == new MiniMerkleTree(leaves).root)
        assert((aliceETHBalanceBefore - aliceETHBalanceAfter) <= assumedGas)
    }

    it("Should make withdrawal.", async function () {
        const randomNumberOfDeposits = getRandomNumber()
        console.log("Making", randomNumberOfDeposits, "extra deposits...")
        for (let i = 0; i < randomNumberOfDeposits; i++)
            await deposit()

        const tree = new MiniMerkleTree(leaves)
        root = tree.root
        const inputObjects = getInputObjects(stdKey, wKey, skey, tree) as any

        writeFileSync(inputs, JSON.stringify(inputObjects))

        const { proof, publicSignals } = await groth16.fullProve(inputObjects as any, wasmPath, zkeyPath)
        const { pi_a, pi_b, pi_c } = proof

        const vKey = JSON.parse(readFileSync(verificationKeyPath) as any);

        console.log(publicSignals)
        console.log(inputObjects.root)
        console.log(toNum(publicSignals.slice(256, 928) as any).toString(16))

        
        const nullifier = BigInt(inputObjects.nullifier)
        const pS = await mainContract.getPublicSignals(root, wKey, nullifier)
        console.log(pS)
        const res = await groth16.verify(vKey, pS as any, proof);
        console.log(res)
        console.log(toNum(pS.slice(256, 928) as any).toString(16))
        console.log(toNum(publicSignals.slice(256, 928) as any).toString(16))

        let p = pS.slice(0,).map((k) => Number(k))

        writeFileSync(path.join(__dirname, "artifacts/c-ps.json"), JSON.stringify({
            circomPS: publicSignals.slice(256, 928)
        }))

        writeFileSync(path.join(__dirname, "artifacts/s-ps.json"), JSON.stringify({
            contractPS: p
        }))

        for (let i = 0; i < 929; i++) {
            assert(p[i] == Number(publicSignals[i]))
        }

        console.log(pS[928], publicSignals[928])

        console.log({ pi_a, pi_b, pi_c, nullifier })

        // pA should be [0, 1].
        const piA = [BigInt(pi_a[0]), BigInt(pi_a[1])] as [BigNumberish, BigNumberish]
        // pB should be [[1, 0], [1, 0]].
        // Flipped.
        const piB = [
            [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])],
            [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])]
        ] as [[BigNumberish, BigNumberish], [BigNumberish, BigNumberish]]
        // pC should be [0, 1].
        const piC = [BigInt(pi_c[0]), BigInt(pi_c[1])] as [BigNumberish, BigNumberish]

        console.log(piA, piB, piC)
        console.log(BigInt(piA[1]) > PRIME)

        await mainContract.withdraw(root, wKey, piA, piB, piC, nullifier, recipient, BigInt(1e10))
    })

    it("Should pass all successful post-withdrawal invariants.", async function () { })
    it("Should revert because nullifier hash has already been used.", async function () { })
})

function getRandomNumber() {
    return Math.floor(Math.random() * 100)
}