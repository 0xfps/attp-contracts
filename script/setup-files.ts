import { Fragment } from "ethers"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import path from "path"

export const DIRECTORY_PATHS = ["/json", "../../attp-config/src/json"]
export const FILE_NAME = "deployments.json"
const ABI_FILE_NAME = "abi.json"

export function setupFiles() {
    for (const dirPath of DIRECTORY_PATHS) {
        const directoryPath = path.join(__dirname, dirPath)
        if (!existsSync(directoryPath)) {
            mkdirSync(directoryPath)
        }

        if (!existsSync(path.join(__dirname, dirPath, FILE_NAME))) {
            writeFileSync(path.join(__dirname, dirPath, FILE_NAME), JSON.stringify({}))
        }
    }
}

export function writeFiles(chainId: number, addressAndTokens: Object, ) {
    for (const dirPath of DIRECTORY_PATHS) {
        const filePath = path.join(__dirname, dirPath, FILE_NAME)
        const fileContents = JSON.parse(readFileSync(filePath) as any)
        const updatedContents = {
            ...fileContents,
            [chainId]: {
                addressAndTokens,
            }
        }

        writeFileSync(filePath, JSON.stringify(updatedContents))
    }
}

export function writeABI(abi: readonly Fragment[]) {
    for (const dirPath of DIRECTORY_PATHS) {
        const filePath = path.join(__dirname, dirPath, ABI_FILE_NAME)
        if (!existsSync(filePath)) {
            writeFileSync(filePath, JSON.stringify({ abi }))
        }
    }
}