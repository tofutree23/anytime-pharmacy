import { useState } from "react";
// create-ait-app:sample-imports:start
import { InAppAdsPage } from "./pages/InAppAdsPage";
// create-ait-app:sample-imports:end

function App() {
  const [page, setPage] = useState<string | null>(null);

  // create-ait-app:sample-routes:start
  if (page === "iaa") return <InAppAdsPage onBack={() => setPage(null)} />;
  // create-ait-app:sample-routes:end

  return (
    <main>
      <h1>Apps in Toss</h1>
      <p>원하는 기능을 샌드박스 앱이나 토스 앱에서 확인해 보세요.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* create-ait-app:sample-buttons:start */}
        <button type="button" onClick={() => setPage("iaa")}>인앱 광고 테스트하기</button>
        {/* create-ait-app:sample-buttons:end */}
      </div>
    </main>
  );
}

export default App;
