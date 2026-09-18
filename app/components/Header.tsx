import Link from "next/link";
import styles from "./Header.module.css";

// [PoC] 전체 페이지 공통 헤더. 상단 메뉴로 페이지 간 이동을 제공한다.
export default function Header() {
  return (
    <header className={styles.header}>
      <span className={styles.brand}>Npay Connect PoC</span>
      <nav className={styles.nav}>
        <Link className={styles.navLink} href="/">
          홈
        </Link>
        <Link className={styles.navLink} href="/docs">
          docs
        </Link>
      </nav>
    </header>
  );
}
