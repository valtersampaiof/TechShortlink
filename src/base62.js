const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Converte um número (id do banco) para base 62: 0 -> "0", 61 -> "Z", 62 -> "10"
export function encode(n) {
  let code = '';
  do {
    code = ALPHABET[n % 62] + code;
    n = Math.floor(n / 62);
  } while (n > 0);
  return code;
}
