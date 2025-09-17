import MiniMerkleTree, { standardizeToPoseidon } from "@fifteenfigures/mini-merkle-tree";
import { AbiCoder } from "ethers";

const coder = AbiCoder.defaultAbiCoder()

export function getRoot(leafNo: number): { leaves: string [], tree: MiniMerkleTree} {
    let leafs = [];
    for (let i = 0; i < leafNo; i++) {
        leafs.push(i)
    }
    
    let leaves = leafs.map(function (leaf) {
        return getEquivLeaf(leaf)
    })
    
    const tree = new MiniMerkleTree(leaves)
    return { leaves, tree }
}

export function getEquivLeaf(i: number): string {
    const encode = coder.encode(["string"], [i.toString()])
    return standardizeToPoseidon(encode)
}