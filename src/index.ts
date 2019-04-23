import { execSync, spawn, StdioOptions } from "child_process"
// import { Readable, ReadableOptions, Transform } from "stream"
import { Readable, Transform } from "stream"

export class ShellError extends Error {
  constructor(message: string) {
    message = message && message.split("\n")[0] // assign only first line
    super(message)
  }
}

export interface IShellOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdio?: StdioOptions
  timeout?: number
  prefix?: string
  shell?: boolean | string
  async?: boolean
}

interface INormalizedShellOptions extends IShellOptions {
  env: NodeJS.ProcessEnv
  stdio: StdioOptions
}

const prefixTransformStream = (prefix: string) =>
  new Transform({
    transform(chunk, encoding, callback) {
      const data = chunk.toString()

      callback(undefined, `${prefix} ${data}`)
    }
  })

// const prefixTransformString = (prefix: string, data: string) => {
//   const lineSeparator = "\n"
//   const dataArray = data.split(lineSeparator)
//   const prefixedDataArray = dataArray.map(line => `${prefix} ${line}`)
//   const prefixedData = prefixedDataArray.join(lineSeparator)
//   return prefixedData
// }

function shellAsync(
  command: string,
  options: INormalizedShellOptions
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const spawnOptions = {
      cwd: options.cwd,
      env: options.env,
      shell: true,
      stdio: (options.prefix && "pipe") || options.stdio
    }
    const asyncProcess = spawn(command, spawnOptions)
    let output: string | null = null
    const stdout: Readable | null = asyncProcess.stdout

    if (options.prefix) {
      const stdoutPrefixTransformStream = prefixTransformStream(options.prefix)
      const stderrPrefixTransformStream = prefixTransformStream(options.prefix)
      asyncProcess.stdout.pipe(stdoutPrefixTransformStream).pipe(process.stdout)
      asyncProcess.stderr.pipe(stderrPrefixTransformStream).pipe(process.stderr)
    }

    asyncProcess.on("error", (error: Error) => {
      reject(
        new ShellError(
          `Failed to start command: ${command}; ${error.toString()}`
        )
      )
    })

    asyncProcess.on("close", (exitCode: number) => {
      if (exitCode === 0) {
        resolve(output)
      } else {
        reject(
          new ShellError(
            `Command failed: ${command} with exit code ${exitCode}`
          )
        )
      }
    })

    if (stdout) {
      stdout.on("data", (buffer: Buffer) => {
        output = buffer.toString()
      })
    }

    if (options.timeout) {
      setTimeout(() => {
        asyncProcess.kill()
        reject(new ShellError(`Command timeout: ${command}`))
      }, options.timeout)
    }
  })
}

function shellSync(
  command: string,
  options: INormalizedShellOptions
): string | null {
  try {
    const execSyncOptions = {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio,
      timeout: options.timeout
    }
    const buffer: string | Buffer = execSync(command, execSyncOptions)
    if (buffer) {
      return buffer.toString()
    }
    return null
  } catch (error) {
    throw new ShellError(error.message)
  }
}

export function shell(
  command: string,
  options: IShellOptions & { async: true }
): Promise<string | null>

export function shell(
  command: string,
  options?: IShellOptions & { async?: false | null }
): string | null

export function shell(
  command: string,
  options?: IShellOptions
): Promise<string | null> | string | null

export function shell(command: string, options: IShellOptions = {}) {
  const normalizedOptions = {
    ...options,
    env: {
      FORCE_COLOR: "1",
      ...(options.env || process.env)
    },
    stdio: options.stdio || "inherit"
  }
  return normalizedOptions.async
    ? shellAsync(command, normalizedOptions)
    : shellSync(command, normalizedOptions)
}
