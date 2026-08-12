"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Report = { grid: string; name: string; description: string; time: string };

const rows = ["A", "B", "C", "D", "E", "F", "G"];
const columns = Array.from({ length: 12 }, (_, index) => index + 1);
const facilities = [
  { id: "ramp", icon: "♿", title: "휠체어 경사로", detail: "해운대관광안내소 앞", x: "18%", y: "34%" },
  { id: "toilet", icon: "WC", title: "장애인 화장실", detail: "해변 중앙 공중화장실", x: "49%", y: "68%" },
  { id: "entry", icon: "↗", title: "접근 가능한 출입구", detail: "해운대역 방면 보행로", x: "80%", y: "26%" },
];

export default function Home() {
  const [selected, setSelected] = useState("6-D");
  const [showFacilities, setShowFacilities] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [notice, setNotice] = useState("격자를 선택하면 약속 장소나 마지막 목격 위치를 정확하게 공유할 수 있어요.");

  useEffect(() => {
    const saved = localStorage.getItem("haeundae-beach-guide-reports");
    if (saved) setReports(JSON.parse(saved));
  }, []);

  const selectedReport = useMemo(() => reports.find((report) => report.grid === selected), [reports, selected]);

  function choose(grid: string) {
    setSelected(grid);
    setNotice(`${grid} 구역을 선택했어요. 이 주소를 가족·친구·구조요원에게 바로 알려주세요.`);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !description.trim()) {
      setNotice("아동 이름과 옷차림 또는 특징을 입력해 주세요.");
      return;
    }
    const next = [...reports.filter((report) => report.grid !== selected), {
      grid: selected, name: name.trim(), description: description.trim(), time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
    }];
    setReports(next);
    localStorage.setItem("haeundae-beach-guide-reports", JSON.stringify(next));
    setName(""); setDescription("");
    setNotice(`긴급 수색 알림을 ${selected} 구역으로 등록했어요. 주변 안내요원에게도 즉시 알려주세요.`);
  }

  return <main className="app-shell">
    <section className="map-section" aria-label="해운대 해변 지도">
      <div className="brand"><span className="brand-mark">⌁</span><div><b>해변가이드</b><small>HAEUNDAE BEACH GUIDE</small></div></div>
      <header className="map-heading"><p className="tag">10M × 10M GRID ADDRESS</p><h1>해운대를 더 가깝고<br />안전하게</h1><p>모래사장 위의 내 위치를<br />정확한 주소로 만나요.</p></header>
      <div className="beach-map">
        <div className="sea"><span>동해</span></div><div className="shore-line" />
        <div className="beach-title">HAEUNDAE<br /><small>BEACH · BUSAN</small></div>
        <div className="grid-wrap"><div className="grid-label grid-top">해변 산책로 · 출입구</div><div className="grid" role="grid" aria-label="해운대 모래사장 10미터 격자">
          {rows.map((row) => columns.map((column) => {
            const address = `${column}-${row}`; const report = reports.find((item) => item.grid === address);
            return <button key={address} className={`cell ${selected === address ? "selected" : ""} ${report ? "alert" : ""}`} onClick={() => choose(address)} aria-label={`${address} 구역 선택`}>{report ? "!" : <><span>{column}</span><b>{row}</b></>}</button>;
          }))}
        </div><div className="grid-label grid-bottom">바다 방향</div></div>
        {showFacilities && facilities.map((facility) => <button className="facility" key={facility.id} style={{ left: facility.x, top: facility.y }} onClick={() => setNotice(`${facility.title}: ${facility.detail}`)} aria-label={facility.title}><span>{facility.icon}</span><i>{facility.title}</i></button>)}
        <div className="legend"><span><i className="sand" />10m 격자</span><span><i className="alert-dot" />수색 알림</span><span><i className="blue-dot" />접근성 시설</span></div>
      </div>
      <div className="map-status"><div><span>현재 선택한 위치</span><strong>{selected} <em>구역</em></strong></div><p>{selectedReport ? <><b>수색 알림 · {selectedReport.name}</b><br />{selectedReport.description} · {selectedReport.time}</> : notice}</p><button onClick={() => navigator.clipboard?.writeText(`해운대해수욕장 ${selected} 구역`)}>주소 복사</button></div>
    </section>

    <aside className="panel"><div className="panel-head"><p className="tag">BEACH SAFETY MAP</p><h2>오늘의 해변 안내</h2><p>필요한 정보를 지도 위에서 바로 확인하세요.</p></div>
      <section className="info-card location-card"><div className="card-icon">◎</div><div><span>내가 선택한 장소</span><h3>{selected} 구역 <small>· 10m × 10m</small></h3><p>해운대해수욕장 모래사장</p></div></section>
      <section className="info-card"><div className="card-title"><div className="card-icon">♿</div><div><h3>장애인 접근성</h3><p>이동에 필요한 시설을 찾아보세요.</p></div></div><button className={`wide-button ${showFacilities ? "active" : ""}`} onClick={() => setShowFacilities(!showFacilities)}>{showFacilities ? "지도에서 시설 숨기기" : "지도에서 시설 보기"}<span>›</span></button></section>
      <form className="report-card" onSubmit={submit}><div className="report-title"><span>긴급</span><div><h3>실종 아동 마지막 위치 신고</h3><p>선택한 격자를 중심으로 수색 범위를 좁혀요.</p></div></div><label>아동 이름<input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김해운" /></label><label>옷차림 또는 특징<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="예: 노란 티셔츠, 파란 모자" /></label><div className="report-location"><span>마지막 목격 위치</span><b>{selected} 구역</b></div><button type="submit" className="report-button">수색 알림 등록하기</button><small className="emergency-note">긴급 상황에서는 112 또는 해변 안전요원에게 먼저 알려주세요.</small></form>
      <div className="tips"><span>안전 이용 팁</span><p>만남 장소는 “{selected} 구역”처럼 격자 주소로 약속해 보세요.</p></div>
    </aside>
  </main>;
}
