const ipv4Mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i

// IPv6 hands a single subscriber a whole /64 to spend as it likes, and privacy
// extensions rotate the interface half on their own, so counting whole
// addresses would hand out a fresh allowance every few hours.
export const networkOf = (address: string) => {
  const plain = address.toLowerCase().split('%')[0] ?? address
  const mapped = ipv4Mapped.exec(plain)?.[1]
  if (mapped) return mapped
  if (!plain.includes(':')) return plain
  const [head = '', tail = ''] = plain.split('::')
  const leading = head ? head.split(':') : []
  const trailing = tail ? tail.split(':') : []
  const groups = plain.includes('::')
    ? [
        ...leading,
        ...Array(Math.max(0, 8 - leading.length - trailing.length)).fill('0'),
        ...trailing,
      ]
    : leading
  return `${groups.slice(0, 4).join(':')}::/64`
}
