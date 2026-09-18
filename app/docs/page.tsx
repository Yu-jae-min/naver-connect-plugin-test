import styles from "../page.module.css";

// [PoC] 참고 문서(HTML) 모음 페이지.
// public/docs/ 에 있는 정적 HTML 문서로 이동하는 버튼만 제공한다.
// 날짜(date)별로 그룹을 두고, 같은 날짜에 여러 문서가 추가될 수 있으므로
// 그룹 하나당 items 배열(label + href)을 받는다.
// 그룹은 오래된 날짜부터 위에서 아래로 순차 표기한다.
type DocItem = {
  href: string;
  label: string;
};

type DocGroup = {
  date: string; // YYYY-MM-DD, 문서가 추가된 날짜
  items: DocItem[];
};

const docGroups: DocGroup[] = [
  {
    date: "2026-09-18",
    items: [
      { href: "/docs/sse-flow.html", label: "SSE 연동 흐름 (Vue2 ↔ Next.js)" },
    ],
  },
];

const sortedGroups = [...docGroups].sort((a, b) =>
  a.date.localeCompare(b.date),
); // 오래된 날짜부터

export default function DocsPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1>참고 문서</h1>
        </div>
        {sortedGroups.map((group) => (
          <div key={group.date} className={styles.intro} style={{ gap: 12 }}>
            <h2 className={styles.groupTitle}>{group.date}</h2>
            <div className={styles.ctas}>
              {group.items.map((item) => (
                <a
                  key={item.href}
                  className={styles.primary}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
