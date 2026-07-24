const ECC_CODEWORDS_PER_BLOCK_M = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
  26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28
];
const NUM_ERROR_CORRECTION_BLOCKS_M = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28,
  29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49
];

class BitBuffer {
  readonly bits: number[] = [];

  append(value: number, length: number): void {
    if (length < 0 || length > 31 || value >>> length !== 0) throw new RangeError("Value does not fit bit length");
    for (let index = length - 1; index >= 0; index -= 1) this.bits.push((value >>> index) & 1);
  }
}

function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8) -
    (ECC_CODEWORDS_PER_BLOCK_M[version] ?? 0) * (NUM_ERROR_CORRECTION_BLOCKS_M[version] ?? 0);
}

function multiply(x: number, y: number): number {
  let result = 0;
  for (let index = 7; index >= 0; index -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((y >>> index) & 1) * x;
  }
  return result;
}

function reedSolomonDivisor(degree: number): number[] {
  const result = Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let position = 0; position < result.length; position += 1) {
      result[position] = multiply(result[position] ?? 0, root);
      if (position + 1 < result.length) result[position] = (result[position] ?? 0) ^ (result[position + 1] ?? 0);
    }
    root = multiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data: number[], divisor: number[]): number[] {
  const result = Array<number>(divisor.length).fill(0);
  for (const value of data) {
    const factor = value ^ (result.shift() ?? 0);
    result.push(0);
    for (let index = 0; index < divisor.length; index += 1) {
      result[index] = (result[index] ?? 0) ^ multiply(divisor[index] ?? 0, factor);
    }
  }
  return result;
}

function addErrorCorrection(data: number[], version: number): number[] {
  const blockCount = NUM_ERROR_CORRECTION_BLOCKS_M[version] ?? 0;
  const eccLength = ECC_CODEWORDS_PER_BLOCK_M[version] ?? 0;
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const shortBlockCount = blockCount - rawCodewords % blockCount;
  const shortBlockLength = Math.floor(rawCodewords / blockCount);
  const divisor = reedSolomonDivisor(eccLength);
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let offset = 0;

  for (let block = 0; block < blockCount; block += 1) {
    const blockDataLength = shortBlockLength - eccLength + (block < shortBlockCount ? 0 : 1);
    const blockData = data.slice(offset, offset + blockDataLength);
    offset += blockDataLength;
    dataBlocks.push(blockData);
    eccBlocks.push(reedSolomonRemainder(blockData, divisor));
  }

  const result: number[] = [];
  const maxDataLength = Math.max(...dataBlocks.map((block) => block.length));
  for (let index = 0; index < maxDataLength; index += 1) {
    for (const block of dataBlocks) if (index < block.length) result.push(block[index] ?? 0);
  }
  for (let index = 0; index < eccLength; index += 1) {
    for (const block of eccBlocks) result.push(block[index] ?? 0);
  }
  if (result.length !== rawCodewords) throw new Error("QR codeword interleave failed");
  return result;
}

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = version === 32 ? 26 : Math.floor((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let index = count - 2; index >= 0; index -= 1) result.push(size - 7 - index * step);
  return result;
}

export type QrMatrix = {
  version: number;
  size: number;
  rows: string[];
};

export function encodeQrMatrix(text: string): QrMatrix {
  const bytes = [...new TextEncoder().encode(text)];
  let version = 1;
  for (; version <= 40; version += 1) {
    const countBits = version <= 9 ? 8 : 16;
    if (bytes.length < 1 << countBits && 4 + countBits + bytes.length * 8 <= dataCodewords(version) * 8) break;
  }
  if (version > 40) throw new RangeError("QR content is too long");

  const capacityBits = dataCodewords(version) * 8;
  const buffer = new BitBuffer();
  buffer.append(0x4, 4);
  buffer.append(bytes.length, version <= 9 ? 8 : 16);
  for (const value of bytes) buffer.append(value, 8);
  buffer.append(0, Math.min(4, capacityBits - buffer.bits.length));
  while (buffer.bits.length % 8 !== 0) buffer.bits.push(0);

  const data: number[] = [];
  for (let index = 0; index < buffer.bits.length; index += 8) {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) value = (value << 1) | (buffer.bits[index + bit] ?? 0);
    data.push(value);
  }
  for (let pad = 0xec; data.length < dataCodewords(version); pad ^= 0xec ^ 0x11) data.push(pad);
  const codewords = addErrorCorrection(data, version);

  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const functions = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const setFunction = (x: number, y: number, dark: boolean) => {
    if (x >= 0 && x < size && y >= 0 && y < size) {
      modules[y]![x] = dark;
      functions[y]![x] = true;
    }
  };
  const drawFinder = (centerX: number, centerY: number) => {
    for (let y = -4; y <= 4; y += 1) {
      for (let x = -4; x <= 4; x += 1) {
        const distance = Math.max(Math.abs(x), Math.abs(y));
        setFunction(centerX + x, centerY + y, distance !== 2 && distance !== 4);
      }
    }
  };
  for (let index = 0; index < size; index += 1) {
    setFunction(6, index, index % 2 === 0);
    setFunction(index, 6, index % 2 === 0);
  }
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);
  const align = alignmentPositions(version);
  for (let row = 0; row < align.length; row += 1) {
    for (let column = 0; column < align.length; column += 1) {
      if ((row === 0 && column === 0) || (row === 0 && column === align.length - 1) || (row === align.length - 1 && column === 0)) continue;
      const centerX = align[column] ?? 0;
      const centerY = align[row] ?? 0;
      if (functions[centerY]?.[centerX]) continue;
      for (let y = -2; y <= 2; y += 1) {
        for (let x = -2; x <= 2; x += 1) setFunction(centerX + x, centerY + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
      }
    }
  }

  const setFormat = (x: number, y: number, dark: boolean) => setFunction(x, y, dark);
  let formatRemainder = 0;
  for (let index = 0; index < 10; index += 1) formatRemainder = (formatRemainder << 1) ^ ((formatRemainder >>> 9) * 0x537);
  const formatBits = formatRemainder ^ 0x5412;
  const formatBit = (index: number) => ((formatBits >>> index) & 1) !== 0;
  for (let index = 0; index <= 5; index += 1) setFormat(8, index, formatBit(index));
  setFormat(8, 7, formatBit(6));
  setFormat(8, 8, formatBit(7));
  setFormat(7, 8, formatBit(8));
  for (let index = 9; index < 15; index += 1) setFormat(14 - index, 8, formatBit(index));
  for (let index = 0; index < 8; index += 1) setFormat(size - 1 - index, 8, formatBit(index));
  for (let index = 8; index < 15; index += 1) setFormat(8, size - 15 + index, formatBit(index));
  setFormat(8, size - 8, true);

  if (version >= 7) {
    let remainder = version;
    for (let index = 0; index < 12; index += 1) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    const bits = (version << 12) | remainder;
    for (let index = 0; index < 18; index += 1) {
      const dark = ((bits >>> index) & 1) !== 0;
      const a = size - 11 + index % 3;
      const b = Math.floor(index / 3);
      setFunction(a, b, dark);
      setFunction(b, a, dark);
    }
  }

  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (functions[y]![x]) continue;
        let dark = false;
        if (bitIndex < codewords.length * 8) dark = ((codewords[bitIndex >>> 3] ?? 0) >>> (7 - (bitIndex & 7)) & 1) !== 0;
        bitIndex += 1;
        if ((x + y) % 2 === 0) dark = !dark;
        modules[y]![x] = dark;
      }
    }
    upward = !upward;
  }

  return { version, size, rows: modules.map((row) => row.map((dark) => dark ? "1" : "0").join("")) };
}
