import { expect } from "chai"
import { ethers } from "hardhat"
import { MINT_VALUE, recipient, SECRET_KEY_LENGTH } from "../constants"
import TinyMerkleTree, { generatekeys, getInputObjects, getRandomNullifier, hashNums, standardizeToPoseidon } from "@fifteenfigures/tiny-merkle-tree"
import { Main, MockERC20 } from "../../typechain-types"
import { BigNumberish, Signer, ZeroAddress } from "ethers"
import assert from "node:assert/strict"
import Randomstring from "randomstring"
import path from "node:path"
import { groth16 } from "snarkjs"

const wasmPath = path.join(__dirname, "/artifacts/main.wasm")
const zkeyPath = path.join(__dirname, "/artifacts/main2.zkey")

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

        mockERC20Token = await ethers.deployContract("MockERC20", ["Mock Token", "Mock"])
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
        assert(await mainContract.root() == new TinyMerkleTree(leaves).root)
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
        assert(await mainContract.root() == new TinyMerkleTree(leaves).root)
        assert((aliceETHBalanceBefore - aliceETHBalanceAfter) <= assumedGas)
    }

    async function depositETH() {
        const secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })
        const { withdrawalKey, depositKey } = generatekeys(ZeroAddress, BigInt(1e15), secretKey)
        const standardizedKey = standardizeToPoseidon(depositKey)

        await mainContract.connect(alice).deposit(depositKey, standardizedKey, { value: BigInt(1e15) })

        stdKey = standardizedKey
        wKey = withdrawalKey
        dKey = depositKey
        skey = secretKey

        leaves.push(standardizedKey)
        assert(await mainContract.root() == new TinyMerkleTree(leaves).root)
    }

    it("Should make withdrawal for token.", async function () {
        const randomNumberOfDeposits = getRandomNumber()
        for (let i = 0; i < randomNumberOfDeposits; i++)
            await deposit()

        const tree = new TinyMerkleTree(leaves)
        root = tree.root
        const inputObjects = getInputObjects(wKey, stdKey, skey, tree) as any

        const nullifier = BigInt(inputObjects.nullifier)
        usedNullifier = nullifier

        const { proof } = await groth16.fullProve(inputObjects as any, wasmPath, zkeyPath)
        const { pi_a, pi_b, pi_c } = proof

        // pA should be [pi_a[0], pi_a[1]].
        const piA = [BigInt(pi_a[0]), BigInt(pi_a[1])] as [BigNumberish, BigNumberish]

        // ⚠️ Notice: snarkjs outputs G2 elements transposed compared to Solidity. You must flip them.
        // pB should be [
        // [pi_b[0][1], pi_b[0][0]]
        // [pi_b[1][1], pi_b[1][0]]
        // ].
        // Flipped. 
        const piB = [
            [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])],
            [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])]
        ] as [[BigNumberish, BigNumberish], [BigNumberish, BigNumberish]]

        // pC should be [pi_c[0], pi_c[1]].
        const piC = [BigInt(pi_c[0]), BigInt(pi_c[1])] as [BigNumberish, BigNumberish]

        await mainContract.withdraw(root, wKey, piA, piB, piC, nullifier, recipient, BigInt(1e10))
        const balance = await mockERC20Token.balanceOf(recipient)
        assert(balance == BigInt(1e10))
    })

    it("Should make withdrawal for ETH.", async function () {
        const randomNumberOfDeposits = getRandomNumber()
        for (let i = 0; i < randomNumberOfDeposits; i++)
            await depositETH()

        const tree = new TinyMerkleTree(leaves)
        root = tree.root
        const inputObjects = getInputObjects(wKey, stdKey, skey, tree) as any

        const nullifier = BigInt(inputObjects.nullifier)

        const { proof } = await groth16.fullProve(inputObjects as any, wasmPath, zkeyPath)
        const { pi_a, pi_b, pi_c } = proof

        // pA should be [pi_a[0], pi_a[1]].
        const piA = [BigInt(pi_a[0]), BigInt(pi_a[1])] as [BigNumberish, BigNumberish]

        // ⚠️ Notice: snarkjs outputs G2 elements transposed compared to Solidity. You must flip them.
        // pB should be [
        // [pi_b[0][1], pi_b[0][0]]
        // [pi_b[1][1], pi_b[1][0]]
        // ].
        // Flipped. 
        const piB = [
            [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])],
            [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])]
        ] as [[BigNumberish, BigNumberish], [BigNumberish, BigNumberish]]

        // pC should be [pi_c[0], pi_c[1]].
        const piC = [BigInt(pi_c[0]), BigInt(pi_c[1])] as [BigNumberish, BigNumberish]

        await mainContract.withdraw(root, wKey, piA, piB, piC, nullifier, recipient, BigInt(1e10))
        const balance = await ethers.provider.getBalance(recipient)
        assert(balance == BigInt(1e10))
    })

    it("Should revert because nullifier hash has already been used.", async function () {
        const randomNumberOfDeposits = getRandomNumber()
        for (let i = 0; i < randomNumberOfDeposits; i++)
            await deposit()

        const tree = new TinyMerkleTree(leaves)
        root = tree.root
        const inputObjects = getInputObjects(wKey, stdKey, skey, tree) as any

        const { proof } = await groth16.fullProve(inputObjects as any, wasmPath, zkeyPath)
        const { pi_a, pi_b, pi_c } = proof

        // pA should be [pi_a[0], pi_a[1]].
        const piA = [BigInt(pi_a[0]), BigInt(pi_a[1])] as [BigNumberish, BigNumberish]

        // ⚠️ Notice: snarkjs outputs G2 elements transposed compared to Solidity. You must flip them.
        // pB should be [
        // [pi_b[0][1], pi_b[0][0]]
        // [pi_b[1][1], pi_b[1][0]]
        // ].
        // Flipped. 
        const piB = [
            [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])],
            [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])]
        ] as [[BigNumberish, BigNumberish], [BigNumberish, BigNumberish]]

        // pC should be [pi_c[0], pi_c[1]].
        const piC = [BigInt(pi_c[0]), BigInt(pi_c[1])] as [BigNumberish, BigNumberish]

        await expect(
            mainContract.withdraw(root, wKey, piA, piB, piC, BigInt(usedNullifier.toString()), recipient, BigInt(1e10))
        ).to.be.revertedWithCustomError(mainContract, "NullifierUsed")
    })
})

function getRandomNumber() {
    return Math.floor(Math.random() * 100)
}