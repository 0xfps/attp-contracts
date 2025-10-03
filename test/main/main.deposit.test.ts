import { ethers } from "hardhat"
import { collector, MINT_VALUE, sCollector, SECRET_KEY_LENGTH } from "../constants"
import TinyMerkleTree, { extractKeyMetadata, generatekeys, getMaxWithdrawalOnAmount, getRandomNullifier, hashNums, standardizeToPoseidon } from "@fifteenfigures/tiny-merkle-tree"
import { Main, MockERC20 } from "../../typechain-types"
import Randomstring from "randomstring"
import { encodeBytes32String, Signer, ZeroAddress } from "ethers"
import assert from "node:assert/strict"
import { expect } from "chai"
import { getLeafFromKey } from "@fifteenfigures/tiny-merkle-tree"

describe("Deposit Tests", function () {
    let mainContract: Main
    let mockERC20Token: MockERC20

    let mockAsset: string
    let mainContractAddress: string

    const amount = BigInt(100000000000000000234n);
    const leaves: string[] = []

    let alice: Signer
    let aliceAddress: string

    let stdKey: string;
    let depKey: string;

    before(async function () {
        alice = (await ethers.getSigners())[0]
        aliceAddress = await alice.getAddress()

        mockERC20Token = await ethers.deployContract("MockERC20", ["Mock Token", "Mock"])
        await mockERC20Token.mint(alice, MINT_VALUE)
        mockAsset = await mockERC20Token.getAddress()

        const verifier = await ethers.deployContract("Groth16Verifier");
        const verifierAddress = await verifier.getAddress()

        const PoseidonT2 = await (await ethers.deployContract("PoseidonT2")).getAddress()
        const PoseidonT3 = await (await ethers.deployContract("PoseidonT3")).getAddress()
        const PoseidonT4 = await (await ethers.deployContract("PoseidonT4")).getAddress()

        const initLeaf = hashNums([getRandomNullifier()])
        leaves.push(initLeaf)

        mainContract = await ethers.deployContract("Main", [initLeaf, verifierAddress], {
            libraries: {
                PoseidonT2,
                PoseidonT3,
                PoseidonT4
            }
        })

        mainContractAddress = await mainContract.getAddress()
    })

    it("Should assert all invariants before a successful deposit.", async function () {
        const aliceHasDeposited = await mainContract.userHasDeposited(aliceAddress, mockAsset)
        assert(aliceHasDeposited == false)

        const secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })
        const { depositKey } = generatekeys(mockAsset, amount, secretKey)
        const standardizedKey = standardizeToPoseidon(depositKey)

        const standardizedKeyDelta = await mainContract.getDepositDelta(standardizedKey)
        const { depositor, asset, amountAfterDeposit } = standardizedKeyDelta.info
        const { uniqueDeposits, currentDeposit } = standardizedKeyDelta

        const collectorBalance = await mockERC20Token.balanceOf(collector)
        const sCollectorBalance = await mockERC20Token.balanceOf(sCollector)
        const collectorETHBalance = await ethers.provider.getBalance(collector)
        const sCollectorETHBalance = await ethers.provider.getBalance(sCollector)

        assert(depositor == ZeroAddress)
        assert(asset == ZeroAddress)
        assert(amountAfterDeposit == 0n)
        assert(uniqueDeposits == 0n)
        assert(currentDeposit == 0n)

        assert(collectorBalance + sCollectorBalance == 0n)
        assert(collectorETHBalance + sCollectorETHBalance == 0n)
    })

    it("Make a successful token deposit.", async function () {
        const secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })
        const { depositKey } = generatekeys(mockAsset, amount, secretKey)
        const standardizedKey = getLeafFromKey(depositKey)

        const aliceETHBalanceBefore = await ethers.provider.getBalance(aliceAddress)

        await mockERC20Token.connect(alice).approve(mainContractAddress, amount)
        const { keyHash, asset, amount: amt } = extractKeyMetadata(depositKey)
        
        await mainContract.connect(alice).deposit(keyHash, asset, BigInt(amt.toString()), { value: BigInt(4e18) })

        const aliceETHBalanceAfter = await ethers.provider.getBalance(aliceAddress)
        const assumedGas = 5e15

        depKey = depositKey;
        stdKey = standardizedKey
        leaves.push(standardizedKey)
        assert(await mainContract.root() == new TinyMerkleTree(leaves).root)
        assert((aliceETHBalanceBefore - aliceETHBalanceAfter) <= assumedGas)
    })

    it("Revert if ETH sent is less than what's configured.", async function () {
        const secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })
        const { depositKey } = generatekeys(ZeroAddress, BigInt(1e18), secretKey)

        const { keyHash, asset, amount: amt } = extractKeyMetadata(depositKey)
        await expect(
            mainContract.connect(alice).deposit(keyHash, asset, BigInt(amt.toString()), { value: BigInt(1e18) - 1n })
        ).to.be.revertedWithCustomError(mainContract, "ETHSentLessThanDeposit")
    })

    it("Make a successful native token deposit.", async function () {
        const secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })
        const { depositKey } = generatekeys(ZeroAddress, BigInt(1e18), secretKey)
        const standardizedKey = getLeafFromKey(depositKey)
        const { keyHash, asset, amount: amt } = extractKeyMetadata(depositKey)
        
        await mainContract.connect(alice).deposit(keyHash, asset, BigInt(amt.toString()), { value: BigInt(1e18) })

        leaves.push(standardizedKey)
        assert(await mainContract.root() == new TinyMerkleTree(leaves).root)
    })

    it("Should make a successful native token deposit if ETH sent > configured.", async function () {
        const secretKey = Randomstring.generate({ length: SECRET_KEY_LENGTH, charset: "alphanumeric" })
        const { depositKey } = generatekeys(ZeroAddress, BigInt(1e18), secretKey)
        const stdKey = getLeafFromKey(depositKey)
        const { keyHash, asset, amount: amt } = extractKeyMetadata(depositKey)
        
        await mainContract.connect(alice).deposit(keyHash, asset, BigInt(amt.toString()), { value: BigInt(1e18) + 1n })

        leaves.push(stdKey)
        assert(await mainContract.root() == new TinyMerkleTree(leaves).root)
    })

    it("Should fail if leaf is repeated.", async function () {
        await mockERC20Token.connect(alice).approve(mainContractAddress, amount)
        const { keyHash, asset, amount: amt } = extractKeyMetadata(depKey)
        
        await expect(
            mainContract
                .connect(alice)
                .deposit(keyHash, asset, BigInt(amt.toString()),)
        ).to.be.revertedWithCustomError(mainContract, "KeyAlreadyUsed")
    })

    it("Should assert all invariants after successful deposits.", async function () {
        const aliceHasDeposited = await mainContract.userHasDeposited(aliceAddress, mockAsset)
        assert(aliceHasDeposited == true)

        const standardizedKeyDelta = await mainContract.getDepositDelta(stdKey)
        const { depositor, asset, amountAfterDeposit } = standardizedKeyDelta.info
        const { uniqueDeposits, currentDeposit } = standardizedKeyDelta
        
        assert(depositor == aliceAddress)
        assert(asset == mockAsset)
        assert(amountAfterDeposit == getMaxWithdrawalOnAmount(amount))
        assert(uniqueDeposits == 1n)
        assert(currentDeposit == getMaxWithdrawalOnAmount(amount))

        const fee = calculateFee(amount, 1n)
        const ethFee = calculateFee(BigInt(2e18), 1n)

        const collectorBalance = await mockERC20Token.balanceOf(collector)
        const sCollectorBalance = await mockERC20Token.balanceOf(sCollector)
        const collectorETHBalance = await ethers.provider.getBalance(collector)
        const sCollectorETHBalance = await ethers.provider.getBalance(sCollector)

        assert(collectorBalance == calculateFee(fee, 90n))
        assert(sCollectorBalance == BigInt(fee.toString()) - collectorBalance)

        assert(collectorETHBalance == calculateFee(ethFee, 90n))
        assert(sCollectorETHBalance == BigInt(ethFee.toString()) - collectorETHBalance)
    })
})

function calculateFee(amount: BigInt, perc: BigInt): BigInt {
    const division = (BigInt(amount.toString()) * BigInt(perc.toString())) / 100n
    const quotient = division.toString().split(".")[0]
    return BigInt(quotient)
}