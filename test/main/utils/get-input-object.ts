import { bytesToBits, convertProofToBits, formatForCircom, getRandomNullifier, hashNums, MerkleTreeInterface } from "@fifteenfigures/mini-merkle-tree";
import { strToHex } from "hexyjs";

// @todo Make this function a part of the mini-merkle-tree package.
export function getInputObjects(
    standardizedKey: string,
    withdrawalKey: string,
    secretKey: string,
    tree: MerkleTreeInterface
): Object {
    const root = convertProofToBits(tree.root)
    const merkleProof = tree.generateMerkleProof(standardizedKey)
    const { proof, directions, validBits } = formatForCircom(merkleProof)

    const withdrawalKeyBits = bytesToBits(new Uint8Array(Buffer.from(withdrawalKey.slice(2, withdrawalKey.length), "hex")))
    const secretKeyBits = bytesToBits(new Uint8Array(Buffer.from(strToHex(secretKey), "hex")))
    const nullifier = getRandomNullifier()
    const nullHash = hashNums([nullifier])
    const nullifierHash = convertProofToBits(nullHash)

    return {
        root,
        withdrawalKey: withdrawalKeyBits,
        secretKey: secretKeyBits,
        directions,
        validBits,
        proof,
        nullifier,
        nullifierHash
    }
}