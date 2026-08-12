"use client";

import { FormEvent, useEffect, useState } from "react";

type Report = { grid: string; name: string; clothes: string };
const rows = ["A", "B", "C", "D", "E", "F", "G"];

export default function Home() {
  const [selected, setSelected] = useState<string>("");
  const [accessibility, setAccessibility] = useState(false);
  const [name, setName] = useState("");
  const [clothes, setClothes] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [notice, setNotice] = useState("백사장 격자를 선택하면 정확한 구역 주소를 확인할 수 있습니다.");

  useEffect(() => {
    const saved = localStorage.getItem("haeundae-safe-reports");
    if (saved) setReports(JSON.parse(saved));
  }, []);

  const choose = (grid: string) => {
    setSelected(grid);
    setNotice(`현재 선택된 격자 주소: [${grid}] 구역 — 모호한 위치 설명 대신 정확한 구역을 공유하세요.`);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !name.trim() || !clothes.trim()) {
      setNotice("이름, 의상/특징을 입력하고 지도에서 마지막 목격 구역을 선택해 주세요.");
      return;
    }
    const next = [...reports.filter((item) => item.grid !== selected), { grid: selected, name: name.trim(), clothes: clothes.trim() }];
    setReports(next);
    localStorage.setItem("haeundae-safe-reports", JSON.stringify(next));
    setNotice(`🚨 [${selected}] 구역 수색 범위가 등록되었습니다. 인근 주민과 관광객의 협조를 요청합니다.`);
    setName("");
    setClothes("");
  };

  return (
    <main className="app-shell">
      <section className="map-section" aria-label="해운대 백사장 격자 지도">
        <header className="map-heading"><span>Haeundae Safe Map</span><h1>해운대 스마트 백사장 안전 지도</h1><p>격자 주소 기반 위치 안내 · 안전 지원 시스템</p></header>
        <div className="beach-map">
          <div className="sea" />
          <div className="beach-label">HAEUNDAE BEACH<br /><small>35.1587, 129.1604</small></div>
          <div className="grid" role="grid" aria-label="해운대 백사장 140개 격자">
            {rows.map((row) => Array.from({ length: 20 }, (_, index) => {
              const grid = `${index + 1}-${row}`;
              const report = reports.find((item) => item.grid === grid);
              return <button key={grid} className={`cell ${selected === grid ? "selected" : ""} ${report ? "alert" : ""}`} onClick={() => choose(grid)} aria-label={`${grid} 구역 선택`}>
                {report ? "🚨" : grid}
              </button>;
            }))}
          </div>
          {accessibility && <div className="facilities" aria-label="장애인 접근성 시설"><span className="facility f1">♿<b>관광안내소 경사로</b></span><span className="facility f2">🚻<b>장애인 화장실</b></span><span className="facility f3">♿<b>조선호텔 접근 출입구</b></span></div>}
          <div className="legend"><span><i />일반 격자</span><span><i className="red" />수색 협조 구역</span></div>
        </div>
        <div className="notice"><strong>{selected ? `현재 선택된 격자 주소: [${selected}] 구역` : "현재 선택된 격자 주소: 선택 전"}</strong><span>{notice}</span></div>
      </section>

      <aside className="panel">
        <p className="eyebrow">SAFETY CONTROL</p><h2>안전 기능 패널</h2><p className="intro">해운대 백사장을 20 × 7 가상 격자로 나누어 더 빠른 안전 대응을 돕습니다.</p>
        <section className="card"><h3>선택 구역</h3><div className="selected-address">{selected ? `현재 선택된 격자 주소: [${selected}] 구역` : "현재 선택된 격자 주소: 선택 전"}</div><p>“해변 중간” 대신 격자 주소로 정확한 위치를 공유할 수 있습니다.</p></section>
        <section className="card"><h3>장애인 접근성</h3><button className={`access-button ${accessibility ? "on" : ""}`} onClick={() => setAccessibility(!accessibility)}>{accessibility ? "♿ 장애인 시설 숨기기" : "♿ 장애인 시설 표시"}</button><p>휠체어 경사로, 장애인 화장실, 접근 가능한 출입구를 표시합니다.</p></section>
        <form className="card report-form" onSubmit={submit}><h3>실종 아동 마지막 위치 신고</h3><label>아동 이름<input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김해운" /></label><label>의상 / 특징<input value={clothes} onChange={(e) => setClothes(e.target.value)} placeholder="예: 노란 티셔츠, 파란 모자" /></label><label>마지막 목격 격자<input value={selected} readOnly placeholder="지도에서 격자를 선택하세요" /></label><button type="submit" className="report-button">🚨 마지막 위치 등록</button></form>
      </aside>
    </main>
  );
}
