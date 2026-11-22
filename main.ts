// TinyStack: a tiny stack VM for make.fun's tiny stack ISA v1 (kit ISA.md;
// vm.mjs beside it is the rule). Runs every /input/<id>/program.bin on
// /input/<id>/input.bin, writes /output/<id>/stdout.bin + exit.txt.
// Local practice run: MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const IN = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
// opcode -> [immediate bytes, popped, pushed]
const S: Record<number, [number, number, number]> = {
  0: [0,0,0], 1: [1,0,1], 2: [4,0,1], 3: [0,1,0], 4: [0,1,2], 5: [0,2,2],
  6: [0,2,3], 7: [0,3,3], 16: [0,2,1], 17: [0,2,1], 18: [0,2,1], 19: [0,2,1],
  20: [0,2,1], 21: [0,2,1], 22: [0,2,1], 23: [0,1,1], 24: [0,2,1], 25: [0,2,1],
  26: [0,2,1], 27: [0,1,1], 28: [0,2,1], 29: [0,2,1], 30: [0,2,1], 32: [0,2,1],
  33: [0,2,1], 34: [0,2,1], 48: [2,0,0], 49: [2,1,0], 50: [2,1,0], 51: [2,0,0],
  52: [0,0,0], 64: [0,1,1], 65: [0,2,0], 80: [0,1,0], 81: [0,1,0], 82: [0,0,1],
  83: [0,1,0],
};
type R = { out: Uint8Array; code: number };
function run(p: Uint8Array, inp: Uint8Array): R {
  const st = new Int32Array(256), rt = new Int32Array(64), mm = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, rp = 0, pc = 0, steps = 0, ol = 0, ip = 0;
  const n = p.length;
  const done = (c: number): R => ({ out: out.slice(0, ol), code: c });
  for (;;) {
    if (steps === 1e6) return done(10); // step limit
    if (pc < 0 || pc >= n) return done(9); // pc outside program
    const op = p[pc], spc = S[op];
    if (!spc) return done(5); // unknown opcode
    const [im, pops, push] = spc;
    if (pc + im >= n) return done(9); // immediate cut off by end
    steps++;
    const nx = pc + 1 + im;
    if (sp < pops) return done(2); // stack underflow
    if (sp - pops + push > 256) return done(3); // stack overflow
    pc = nx;
    switch (op) {
      case 0: return done(0); // HALT
      case 1: st[sp++] = (p[nx - 1] << 24) >> 24; break; // PUSH8 sign-extended
      case 2: st[sp++] = p[nx-4] | p[nx-3] << 8 | p[nx-2] << 16 | p[nx-1] << 24; break; // PUSH32
      case 3: sp--; break; // POP
      case 4: st[sp] = st[sp-1]; sp++; break; // DUP
      case 5: { const t = st[sp-1]; st[sp-1] = st[sp-2]; st[sp-2] = t; break; } // SWAP
      case 6: st[sp] = st[sp-2]; sp++; break; // OVER
      case 7: { const a = st[sp-3]; st[sp-3] = st[sp-2]; st[sp-2] = st[sp-1]; st[sp-1] = a; break; } // ROT
      case 23: st[sp-1] = -st[sp-1] | 0; break; // NEG
      case 27: st[sp-1] = ~st[sp-1]; break; // NOT
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30: case 32: case 33: case 34: {
        const b = st[sp-1], a = st[sp-2];
        let r: number;
        switch (op) {
          case 16: r = a + b | 0; break; // ADD wraps
          case 17: r = a - b | 0; break; // SUB wraps
          case 18: r = Math.imul(a, b); break; // MUL low 32 bits
          case 19: if (!b) return done(4); r = a / b | 0; break; // DIV truncates; INT_MIN/-1 -> INT_MIN via |0
          case 20: if (!b) return done(4); r = a % b | 0; break; // MOD, sign of a; x%-1 is 0
          case 21: if (!b) return done(4); r = (a >>> 0) / (b >>> 0) | 0; break; // DIVU
          case 22: if (!b) return done(4); r = (a >>> 0) % (b >>> 0) | 0; break; // MODU
          case 24: r = a & b; break;
          case 25: r = a | b; break;
          case 26: r = a ^ b; break;
          case 28: r = a << (b & 31); break; // SHL
          case 29: r = a >> (b & 31); break; // SHR arithmetic
          case 30: r = a >>> (b & 31) | 0; break; // SHRU logical
          case 32: r = a === b ? 1 : 0; break; // EQ
          case 33: r = a < b ? 1 : 0; break; // LT signed
          default: r = (a >>> 0) < (b >>> 0) ? 1 : 0; // LTU unsigned
        }
        sp -= 2; st[sp++] = r;
        break;
      }
      case 48: case 49: case 50: { // JMP / JZ / JNZ, signed 16-bit offset from next
        const rel = (p[nx-2] | p[nx-1] << 8) << 16 >> 16;
        let take = op === 48;
        if (!take) { const v = st[--sp]; take = op === 49 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 51: // CALL, unsigned 16-bit target
        if (rp === 64) return done(7);
        rt[rp++] = nx; pc = p[nx-2] | p[nx-1] << 8;
        break;
      case 52: // RET
        if (!rp) return done(8);
        pc = rt[--rp];
        break;
      case 64: { // LOAD
        const a = st[sp-1];
        if (a < 0 || a > 255) return done(6);
        st[sp-1] = mm[a];
        break;
      }
      case 65: { // STORE pops (v addr)
        const a = st[sp-1], v = st[sp-2];
        if (a < 0 || a > 255) return done(6);
        sp -= 2; mm[a] = v;
        break;
      }
      case 80: { // PRINT decimal ASCII, no newline
        const s = String(st[sp-1]);
        if (ol + s.length > 65536) return done(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        break;
      }
      case 81: // PUTC one byte
        if (ol + 1 > 65536) return done(11);
        out[ol++] = st[--sp] & 255;
        break;
      case 82: // IN, -1 once input is used up
        st[sp++] = ip < inp.length ? inp[ip++] : -1;
        break;
      default: // EXIT, low byte of v
        return done(st[--sp] & 255);
    }
  }
}
for (const id of readdirSync(IN).sort()) {
  const r = run(readFileSync(join(IN, id, 'program.bin')), readFileSync(join(IN, id, 'input.bin')));
  mkdirSync(join(OUT, id), { recursive: true });
  writeFileSync(join(OUT, id, 'stdout.bin'), r.out);
  writeFileSync(join(OUT, id, 'exit.txt'), `${r.code}\n`);
}
