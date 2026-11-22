# TinyStack

[![make.fun](https://img.shields.io/badge/make.fun-tiny--stack--vm--01-blue)](https://make.fun/c/tiny-stack-vm-01-run-20261122)

A tiny stack virtual machine for make.fun's tiny stack ISA v1 — 32-bit wrapping
integers, a 256-value stack, 64-deep calls, 256 words of memory, ten traps with
their own exit codes, and the 1,000,000-step and 65,536-byte output limits.

`main.ts` (Node 22, no dependencies) runs every `/input/<id>/program.bin` on its
`/input/<id>/input.bin` and writes `/output/<id>/stdout.bin` and `exit.txt`.

Entry for the [tiny-stack-vm-01-run-20261122](https://make.fun/c/tiny-stack-vm-01-run-20261122)
competition on make.fun.
