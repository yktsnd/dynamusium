# DynaMusium Dynamical Portrait Foundation

> 設計・科学監査文書 — 2026-07-19
>
> 監査対象: [yktsnd/dynamusium at 1412542](https://github.com/yktsnd/dynamusium/tree/1412542b3cce85b3aef8c6e77e977c9f853d3660)
>
> 性格: 1412542 時点の監査記録と、その後の実装 disposition。新しい数学理論の提案ではない

## 文書の読み方と実装ステータス

本書の§1.2、§1.3、§8、§9は、リンク先の commit **1412542** を監査した歴史的記録である。
そこにある「現行」「未実装」「surrogate」は、
現在のDynamical Portrait実装を指さない。修正前に何が問題で、なぜこの設計を選んだかを追跡できるよう
意図的に保存している。§10は、そのbaseline roadmapに対する現在のdispositionである。

現在の契約と挙動については [architecture.md](./architecture.md)、
[model-contract.md](./model-contract.md)、[numerical-method.md](./numerical-method.md)、
[visual-language.md](./visual-language.md) を正とする。roadmapの disposition は次の通りである。

| Phase | Disposition                      | 現在の実装                                                                                                                                                                                                                         | 明示的に未実装 / 異なる点                                                                                                                                                                               |
| ----- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | **Implemented**                  | non-finite、次元、dispatch、hard checkのfailureを表示不能なtyped invalid resultにし、新request中は旧resultを外す                                                                                                                   | baselineのsurrogate表示を残す暫定策ではなく、field作品を実solver / analytic family / samplerへ置換した                                                                                                  |
| 1     | **Implemented differently**      | WorkManifest v2、formal class、representation、regime / claim、provenance、evidence、maturity、semantic mapping、composition、strict v1 / v2 schema                                                                                | 永続的な汎用v1→v2推測器は作らない。v1 contributionは、既知のreview済みkernelだけを明示adapterで昇格する                                                                                                 |
| 2     | **Implemented**                  | LorenzとFed Reaction Chainのreviewed kernel、raw state / cumulative flux、claim-specific checks、固定semantic bindings                                                                                                             | 解析結果を完全なattractor / invariant measureとは呼ばない                                                                                                                                               |
| 3     | **Implemented**                  | Kuramotoの12 phase / order parameterと、FPUTのfull position–momentum state、velocity Verlet、modal energy / Hamiltonian evidence                                                                                                   | locking、recurrenceは有限時間・宣言regimeに限定する                                                                                                                                                     |
| 4     | **Implemented differently**      | Gray–Scott、明示差分Cahn–Hilliard、seeded Metropolis Ising、線形回転浅水系、analytic Wave / Heat / Schrödinger、1D reduced Budyko–Sellers                                                                                          | 提案にあったspectral Cahn–Hilliardやfinite-volume shallow-waterを実装したとは主張しない。採用した有限grid / centered schemeの残差だけを報告する                                                         |
| 5     | **Foundation scope implemented** | liveのfinite recurrence / occupancy、観測box SCC、identity-dictionary ridge EDMD、interface、finite-grid H0、およびbounded authoring APIとしてpseudo-arclength continuation、explicit-dictionary EDMD、finite transition enclosure | validated branch、true Koopman eigenfunction / transfer spectrum、continuum topology / Morse–Smale、computer-assisted proofはgeneric browser scope外。per-work external reviewed artifactとしてのみ受理 |
| 6     | **Implemented**                  | permanent collection 30作品をv2 portraitへ移行し、community v2 schema / scaffolder、科学reviewとcomposition / accessibility reviewを分離                                                                                           | 全作品をM3 / M4へ昇格していない。`not-run`と低いmaturityを残すことが契約の一部                                                                                                                          |

「implemented」は全作品をM3またはM4と呼ぶことも、有限精度の候補を検証済み定理と呼ぶことも
意味しない。各runのattained maturityは、active
regime、representation、実際にpassしたcheck、review済みcapから機械的に制限される。M0や
`not-run`を残すことも科学的監査の一部である。既存のmuseum画面、Observe / Study / Exhibit、
deep-ink palette、余白、静かな長時間演出は内部契約を置き換えても維持する。Fableを含む特定の
authoring toolは必要条件ではなく、利用する場合もcomposition境界の外へ科学的意味を変更できない。

## 調査方法と証拠の範囲

本書は、README、30作品のカタログ、manifest/schema、museum runtime、旧 reaction-network runtime、数値 solver、worker、Observe / Study / Exhibit、CSS、contribution contract、単体・E2Eテストを上記 commit で調査した結果に基づく。さらに production build を起動し、desktop画面で Lorenz と Gray–Scott の Observe / Study / Exhibit を操作した。Gray–Scott では時間スライダーを動かしても Canvas の画素データが変わらないことも確認した。

理論上の主張には原典または一次資料を付した。コードについて「現行」と書くときは、特記しない限り上記 commit を指す。数学的に証明された対象、数値的に推定された対象、有限時間の可視化上の印象は区別する。

---

## 1. 結論

### 1.1 採るべき方向

DynaMusiumは全面リライトすべきではない。完成度の高い museum shell と展示言語を保ったまま、その内側の契約を次の一方向パイプラインへ置き換えるのが妥当である。

    Dynamical System Specification
              ↓
    Computation / Evidence Run + provenance
              ↓
    Dynamical Portrait
              ↓
    Evidence-backed Scientific Objects
              ↓
    Semantic Visual Layers
              ↓
    Curated Composition (implementation-neutral)

基幹数学は単一理論ではなく、確立した理論の役割分担とする。

- 最上位の共通形式: deterministic（map / flow / semiflow / nonautonomous process）、stochastic、hybrid flow-jump system のtagged union。stochastic branchは同じ系にpathwise cocycle viewとlaw-level Markov viewを併記できる
- 大域骨格: chain recurrence、Conley理論、有限 Morse decomposition / Morse graph。ただし計算根拠のある作品だけ
- 局所安定性: differentiable dynamical systems、線形化、固有値、Lyapunov量、安定・不安定多様体
- パラメータ変化: bifurcation theory と numerical continuation
- 長時間統計: empirical / invariant measure、ergodic theory、correlation、mixing、entropy
- 高次元時間構造: Koopman operator と DMD。ただし observable、sampling、residual、holdout を伴う補助証拠
- 計算・近似: review済みのlawまたはdatasetを科学的なsource of truthとし、表現種別に適したsolver / analytic evaluator / samplerでrunを作る。set-oriented methods と computational topology は適用可能なときの分析器とする

したがって、提案された「位相力学系 + Conley + 分岐 + エルゴード + Koopman + set-oriented / topology」という構成の役割分担は概ね正しい。ただし、すべてを「位相力学系」という一個の型へ押し込めると、非自律系、確率系、Markov過程、hybrid jump の意味を失う。最上位は一個の万能形式ではなく、既存の evolution semantics を明示する小さな和型にすべきである。

### 1.2 現行実装から分かったこと

> **Historical baseline:** この節の「現行」は監査commit 1412542を指す。現在の実装は冒頭の
> dispositionと§10を参照。

| 項目                  | 実装上の事実                                                                                                                                                                                                                                                                                                                            | 設計上の意味                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 思想                  | READMEは model を「observe, operate, question, source, preserve」する文化的対象とし、client-only、no account / backend / analytics / storage を明記する ([README](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/README.md#L11-L27))                                                                | 本提案と整合する。科学的 provenance と保存可能な contract を強化すべき                                           |
| 作品                  | 5 galleries × 6 = 30作品、うち6 flagship。宣言 runtime は ode 16、field 7、discrete 3、analytic 3、reaction-network 1                                                                                                                                                                                                                   | 30作品へ段階移行できる小さな schema が必要                                                                       |
| 実効 runtime          | 実際はmuseum-array RK4 17、analytic 3、discrete 2、synthetic scalar field 8（Isingを含む）。[simulateWork](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/simulation.ts#L636-L644) は manifest の runtime を dispatch に使わず、ODE → analytic → discrete → field の順に kernel 名を試す | runtime は現在、実行契約ではなく表示メタデータ。registry と型付き dispatch が必要                                |
| renderer              | 宣言は series 9、field 8、phase 7、orbit 6。実際はfieldがあれば単一 Canvas、なければ全作品が generic 2D SVG polyline + active point ([MuseumApp](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/MuseumApp.tsx#L215-L295))                                                                | phase / orbit / series / field は実効的な描画分類ではない。geometry ではなく scientific object を渡すべき        |
| manifest / schema     | curatorial metadata、runtime / render / kernel、bounded parameters、presets、citationsを持つ。community JSONはauto-discoverされるが、built-in catalogもcommunity manifestも実際のJSON Schema validatorを通らない                                                                                                                        | 現行の小ささを保ち、formal / claim / provenance / mappingだけを追加する                                          |
| WorkResult            | duration、times、generic series、points、optional single field、diagnostics string ([types.ts](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/types.ts#L69-L76))                                                                                                                         | failure、units、projection、seed、provenance、validation、field frames、uncertainty、scientific objects が欠ける |
| Observe / Study       | 同一 WorkResult を使い、Studyは summary、question、equation、diagnostic、表、source を追加 ([MuseumApp](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/MuseumApp.tsx#L340-L401))                                                                                                         | progressive disclosure は維持できる。Studyを「主張の根拠」に強化する                                             |
| Exhibit               | active Museumでは再生を開始し、chrome の opacity を落とす。hover / focus で復帰する ([MuseumApp](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/MuseumApp.tsx#L428-L573))。旧useExhibitionのfullscreen / auto-advance stackは切断中                                                      | 静かな展示思想は維持。将来の staging も同一科学レイヤーの reveal に限定                                          |
| 旧専用 runtime        | typed valid / invalid result、non-finite abort、positivity、monotone reservoir、rate→width / emission frequency、time-integrated rate→cumulative particle count を持つが現行 MuseumApp とは切断                                                                                                                                         | 捨てずに、failure union と意味対応の先行実装として再利用する                                                     |
| contribution contract | sourced、deterministic、equation-consistent、invariant/reference test、non-finiteを表面化、reduced motion を要求 ([CONTRIBUTING_WORKS](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/CONTRIBUTING_WORKS.md#L3-L42))                                                                                | 方針は良いが museum runtime が満たしていない。一般化より先に実装を contract へ戻す                               |

**現行30作品**

- Motion & Chaos: Double Pendulum、Kuramoto Oscillators、FPUT Chain、Logistic Map、Wave Equation、Standard Map
- Matter & Pattern: Fed Reaction Chain、Gray–Scott Pattern、Heat / Diffusion、Schrödinger Wave Packet、Ising Model、Cahn–Hilliard Separation
- Life & Reaction: Lotka–Volterra、Brusselator、Oregonator、SIR Epidemic、Hodgkin–Huxley Neuron、FitzHugh–Nagumo
- Earth & Climate: Lorenz Atmosphere、Stommel Ocean Box、Daisyworld、Three-Box Carbon Cycle、Shallow-Water Waves、Budyko–Sellers Climate
- Cosmos & Gravity: Restricted Three-Body、Kepler Orbit、Hohmann Transfer、N-Body System、Friedmann–Lemaître Universe、Exoplanet Transit

### 1.3 最優先判断

一般化の前に、科学的に P0 とみなす少なくとも四系統を修正する必要がある（§9ではfieldの虚偽表示を「solverでないこと」と「空間rowをtimeにすること」に分けて数える）。

1. Gray–Scott、Cahn–Hilliard、Ising、Shallow-water を含む field作品は、現行では支配方程式の時間発展を解いていない。単一の数式合成模様である。しかも空間の行平均を時間系列として表示している。
2. museum RK4 は非有限値を 0 に置換し、有限値も ±1e6 に silent clamp する。発散や solver failure を「有限な作品」に変えてしまう。
3. derivative / state配列の次元が不足しても ?? 0 で埋め、kernel bugを別の有限trajectoryへ変える。
4. worker failure時に旧resultが残り、新parameter UIと旧trajectoryが同じcurrent workとして表示される。

当面これらを削除する必要はない。UIを維持しつつ representation を “illustrative surrogate” と明示し、偽の時間表示を止める。その後に実 solver へ一作品ずつ昇格させる。

### 1.4 維持すべき美的アイデンティティ

実画面で確認した次の特徴は、内部一般化と独立であり、原則維持する。

- deep ink / cosmic-ocean の静かな room と、科学レイヤーから分離された ambient atmosphere
- cyan / violet の細い軌跡、抑制された glow、単一の active point
- Space Grotesk の見出し、Inter の本文、JetBrains Mono の数値
- 左の caption と右の phenomenon、広い余白、低 opacity の題名
- 主像と同期する細い trace strip
- Observeを静かに保ち、Studyで根拠を開示し、ExhibitでUIを退かせる構造
- 旧 reaction visual の quantity→fill、instantaneous rate→幅 / emission frequency、time-integrated rate→cumulative particle count、direction→lane / chevron という科学的に明確な対応

一般化はこれらを破壊する renderer 大改造ではなく、「何がその光・線・密度を生むか」を正確にする作業である。

---

## 2. 完全分類が不可能な理由と、実用上目指すべき範囲

### 2.1 「分類」の同値関係が一意でない

位相共役、滑らかな共役、軌道同値、測度同型、スペクトル同値、統計的近似は別の問いである。たとえば同じ位相軌道構造を持つ二系でも、時間 parametrization、Lyapunov exponent、invariant measure は異なり得る。したがって「dynamics のクラス」は、何を保存する同値関係かを指定しなければ定義できない。

### 2.2 一般系には分類不能性・決定不能性がある

- 測度保存エルゴード変換の同型関係は complete analytic で Borel ではなく、可算または有限な便利な不変量による完全分類を期待できない ([Foreman–Rudolph–Weiss, 2011](https://doi.org/10.4007/annals.2011.173.3.7))。
- 力学系には計算過程を符号化でき、長時間挙動に関する一般判定問題が決定不能になり得る ([Moore, 1990](https://doi.org/10.1103/PhysRevLett.64.2354))。さらに滑らかな3次元ODEが任意のTuring machineをsimulateできる構成も知られている ([Branicky, 1995](https://doi.org/10.1016/0304-3975%2894%2900147-B))。
- 上記のようにunrestricted hybrid / continuous formalismsがuniversal computationを許す以上、完全なlong-time classifierは期待できない。より具体的にも、二つの行列の全ての有限積がboundedかという問題は一般に決定不能である ([Blondel–Tsitsiklis, 2000](https://doi.org/10.1016/S0167-6911%2800%2900049-9))。

さらに chaos では初期値誤差が増幅し、PDE、確率系、高次元系では discretization、有限 sample、projection が対象そのものを変える。数値 portrait は真の無限時間対象の同義語ではない。

### 2.3 DynaMusiumが目指すべき有限な約束

完全分類の代わりに、次のスコープ付き portrait を返す。

    Portrait(system, parameters, domain, initial/ensemble,
             observables, time window, spatial/temporal resolution,
             numerical method)

各 portrait は次を明示する。

- formal class と state-space representation
- 観測された orbit / field と、そこから推定した object の区別
- theoretical / numerical / rigorous の evidence kind
- domain、time window、resolution、observable
- residual、convergence、uncertainty
- science maturity

成功条件は「全力学系を一意に分類すること」ではない。「この条件と解像度で、どの数学的対象を、どの根拠で、何として見せているか」を訪問者と contributor の双方が追跡できることである。

---

## 3. 既存数学領域の比較

表中の「完全」は、一般クラスの完全分類が可能かを指す。「有限/無限」は state-space 次元への理論的適用性であり、ブラウザで同じ計算量を実現できるという意味ではない。

### 3.1 共通記述、分類対象、適用範囲

| 候補                                       | 何を共通に記述するか                                               | 何を分類・抽出するか                                                                                      | 完全分類                                 | 主対象                                    | 有限 / 無限                   | 決定論 / 確率論                                       |
| ------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------- | ----------------------------- | ----------------------------------------------------- |
| Topological dynamical systems              | 位相空間上の連続 map、flow、semiflow                               | orbit、invariant set、recurrence、minimality、topological conjugacy                                       | 一般には不可                             | ODE、maps、PDE semiflow                   | 両方                          | 主に決定論。skew productを介し確率系にも              |
| Differentiable dynamical systems           | 多様体上の滑らかな map / vector field                              | equilibria、periodic orbit、linear stability、manifold、Lyapunov量                                        | 特殊クラスのみ                           | 滑らかな有限次元ODE/map                   | 有限が中心。Banach空間版あり  | 主に決定論                                            |
| Structural stability / hyperbolic dynamics | 摂動で orbit構造が保たれる系                                       | hyperbolic set、Axiom A、stable/unstable splitting、robustness                                            | 構造安定な制限クラスでは強い             | smooth map / flow                         | 主に有限                      | 決定論中心                                            |
| Conley theory                              | compact invariant set を isolating neighborhood で捉える           | isolated invariant set、attractor–repeller、chain recurrent skeleton                                      | 不変量は完全でない                       | map、flow、semiflow                       | 両方                          | RDS版はあるが別途 measurability が必要                |
| Chain recurrence                           | ε-pseudo-orbit で戻れる大域部分                                    | chain recurrent set と chain components                                                                   | 完全でない                               | 連続 map / flow                           | 両方                          | 決定論。random版は拡張                                |
| Morse decomposition / Morse graph          | recurrent pieces と gradient-like connections                      | 有限 Morse sets、partial order、connection可能性                                                          | 選んだ decomposition 内のみ              | Conley設定、set-valued enclosure          | 両方                          | 決定論中心、random拡張あり                            |
| Conley index                               | isolated invariant set の位相的不変量                              | nontrivial indexによるisolated invariant dynamicsの非空性・continuation。特定orbit typeには追加仮定が必要 | 同じ index の異なる系がある              | isolated invariant sets                   | 両方                          | 主に決定論                                            |
| Bifurcation theory                         | parameterized family of evolution laws                             | equilibrium / cycle の生成・消滅、stability change、branches                                              | 局所 normal form等に限定                 | smooth ODE/map、PDE、hybridの一部         | 両方                          | deterministic中心。stochastic bifurcationは定義が複数 |
| Ergodic theory / invariant measures        | measure-preserving transformation / semigroup                      | ergodicity、time-space average、decomposition、stationary statistics                                      | 一般同型分類は不可                       | deterministic / stationary stochastic     | 両方                          | 両方                                                  |
| Entropy / mixing                           | 情報生成率と相関喪失                                               | entropy、mixing階層、correlation decay                                                                    | 単一値で完全でない                       | measure/topological systems               | 両方                          | 両方                                                  |
| Koopman operator theory                    | observable を合成で線形発展させる作用素                            | eigenfunction、eigenvalue、mode、continuous spectrum                                                      | spectrumだけでは完全でない               | nonlinear deterministic systems           | 両方                          | stochastic Koopman / Markov と接続                    |
| DMD / spectral decomposition               | sample列上の有限 rank linear approximation                         | 周波数、成長・減衰、spatial mode                                                                          | 推定法であり分類でない                   | sampled high-dimensional data             | 実装は有限表現                | noise-aware variantあり                               |
| Set-oriented numerical methods             | phase space を boxes / cells で被覆した transfer / multivalued map | invariant sets、basins、Morse graph、almost invariant sets                                                | resolution依存                           | low–moderate dimension または reduction後 | 理論は両方、計算は次元制約    | deterministic / stochastic transfer operator          |
| Computational topology                     | sample / enclosure の homology 等                                  | connected components、holes、persistent features、index                                                   | 埋め込み・scale依存                      | point cloud、cubical grid、fields         | 有限データとして処理          | ensembleにも適用可                                    |
| Morse–Smale complex                        | scalar function の critical points と gradient flow                | ascending / descending manifolds、separatrices、cells                                                     | 関数とmetricに対する分解                 | scalar field / manifold                   | 主に有限 discretization       | stochastic dynamicsの分類器ではない                   |
| Random dynamical systems / cocycles        | noise shiftをbase、state evolutionをcocycleとして記述              | random invariant set、random attractor、Lyapunov spectrum                                                 | 一般には不可                             | SDE、random maps/PDE                      | 両方                          | 確率系をpathwiseに扱う                                |
| Hybrid dynamical systems                   | flow set / map と jump set / map                                   | executions、invariance、stability、Zeno、reachability                                                     | 一般には不可・一部 undecidable           | switch、impact、event systems             | 通常有限、無限次元拡張も      | deterministic / stochastic hybrid                     |
| Markov semigroups                          | probability law / observable の時間発展                            | stationary measure、ergodicity、spectral gap、mixing                                                      | 一般には不可                             | CTMC、diffusion、SPDE                     | 両方                          | 確率系に自然                                          |
| Symbolic dynamics                          | orbit を有限 / 可算 alphabet の列へ符号化                          | subshift、forbidden words、entropy、periodic codes                                                        | generating partitionがある制限系では強い | maps/flowsのcoding                        | finite alphabetでも元系は多様 | stochastic sequenceにも                               |
| Category-theoretic descriptions            | open systems、wiring、composition、interfaces                      | 合成則、equivalence of representations                                                                    | dynamicsの挙動分類器ではない             | networked / compositional systems         | 両方                          | Markov process等も合成可能                            |

Topological dynamics の基礎的な共通言語は [Gottschalk–Hedlund](https://doi.org/10.1090/coll/036)、hyperbolic / structurally stable systems の範囲と強さは [Smale](https://doi.org/10.1090/S0002-9904-1967-11798-1) と [Robbin](https://doi.org/10.2307/1970766)、Conley理論は [Conley](https://doi.org/10.1090/cbms/038) による。ここで Conley index、Morse decomposition、Morse–Smale complex は同義ではない。前二者は invariant dynamics の isolation と connection を扱い、後者は選んだ scalar function の gradient geometry を分割する。

確率系には deterministic flow という語を拡大解釈するより、pathwiseな cocycle としての [Arnold, Random Dynamical Systems](https://doi.org/10.1007/978-3-662-12878-7)、分布発展としての Markov semigroup を明示する方が科学的である。hybrid系も flow だけでなく jump semantics が必要である ([Goebel–Sanfelice–Teel](https://doi.org/10.23943/princeton/9780691153896.001.0001))。

### 3.2 数値化、ブラウザ実装、描画親和性、限界

| 候補                        | 数値計算への落とし込み                     | ブラウザ実装               | DynaMusium描画との親和性                                                                          | 主な理論・実務限界                                                                                      |
| --------------------------- | ------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Topological systems         | orbit samplingは容易、共役判定は困難       | 高い                       | orbit / recurrenceの語彙を統一                                                                    | topology、domain、continuityをmanifestが持たないと空疎                                                  |
| Differentiable systems      | Jacobian、eigenvalue、continuationが成熟   | 高い（小規模）             | equilibrium、manifold、local arrows                                                               | nonsmooth、stochastic、fieldではそのまま使えない                                                        |
| Hyperbolic dynamics         | validated numericsなら強い                 | 低〜中                     | robustness badge と Study evidence                                                                | 多くの興味深い系は非一様双曲的・非双曲的                                                                |
| Conley theory               | isolating blocks / combinatorial enclosure | 低〜中                     | recurrent skeletonを少数の静かな島として示せる                                                    | isolating regionの証拠が必要。軌跡の見た目から宣言不可                                                  |
| Chain recurrence            | grid / multivalued map 近似                | 中（低次元）               | recurrent / transientを意味ある二層に分ける                                                       | finite ε と finite time の偽陽性・偽陰性                                                                |
| Morse decomposition / graph | set-oriented enclosureと相性がよい         | 中                         | Morse sets と接続の静かな構図                                                                     | edgeは確率・fluxではなく、partial order / connection evidence                                           |
| Conley index                | cubical homology等                         | 低〜中                     | Studyで存在・継続の根拠                                                                           | indexを装飾形状に変換してはいけない                                                                     |
| Bifurcation                 | continuation packageは成熟                 | 中。重い解析はbuild-time可 | parameter sweepをregime変化として演出                                                             | 一本のslider traversalはbranch diagramの代替でない                                                      |
| Ergodic / invariant measure | long run、ensemble、Ulam等                 | 高いが収束は高コスト       | occupancy / residence densityに直接対応                                                           | histogramは empirical measure。ergodicity証明なしに invariant と断定不可                                |
| Entropy / mixing            | estimator多数                              | 中                         | entropyは原則Studyの数値 / partition summary。mixingは測定済みcorrelation fade / ensemble overlap | estimator / partition / sample size依存。視覚的乱雑さと同義でない                                       |
| Koopman                     | EDMD、kernel、Galerkin等                   | 中                         | frequency / decay / coherent mode                                                                 | observable依存、continuous spectrum、spectral pollution                                                 |
| DMD                         | SVD / eigendecomposition                   | 高い（小rank）             | field mode と時間係数を分離                                                                       | DMD modeを検証なしに Koopman eigenmode と呼べない ([Schmid](https://doi.org/10.1017/S0022112010001217)) |
| Set-oriented                | boxes、transition graph、transfer matrix   | 低〜中                     | basin / recurrent cells / Morse graph                                                             | curse of dimensionality。高次元はreductionと誤差表記が必須                                              |
| Computational topology      | persistent / cubical homology              | 中                         | interface、components、holesの根拠                                                                | metric、threshold、embeddingに敏感 ([Zomorodian–Carlsson](https://doi.org/10.1007/s00454-004-1146-y))   |
| Morse–Smale complex         | scalar gridで成熟                          | 中                         | fieldのcritical structureとseparatrix                                                             | dynamicsそのものではなく、選んだscalar fieldのgradient構造                                              |
| Random cocycle              | path ensemble、sample Lyapunov             | 中                         | 同じnoise realizationを再生可能                                                                   | seedだけでなくPRNG、law、interpretation、ensemble sizeが必要                                            |
| Hybrid                      | event detection、reachability              | 中                         | flowとjumpを異なる channel で示せる                                                               | missed event、Zeno、reset precision。固定時刻sampleだけでは不十分                                       |
| Markov semigroup            | transition matrix、generator、Monte Carlo  | 高い（有限状態）           | stationary density、probability flux                                                              | 一軌跡をprobability lawと混同しない                                                                     |
| Symbolic dynamics           | event / partition codingは容易             | 高い                       | recurrence words、return itinerary                                                                | partitionが非生成なら、codeはcoarse observableにすぎない                                                |
| Category theory             | typed ports / compositionに有効            | 高い                       | contribution API とnetwork組立に有効                                                              | visual portraitや長時間挙動を自動的に導かない                                                           |

Koopmanの原点は [Koopman, 1931](https://doi.org/10.1073/pnas.17.5.315)、流体への mode decomposition は [Rowley et al., 2009](https://doi.org/10.1017/S0022112009992059)、DMDと非線形系の関係を実用化した一例は [Brunton et al., 2016](https://doi.org/10.1371/journal.pone.0150171) である。これらは「全非線形系を有限次元線形系として完全に解く」主張ではない。

Set-oriented methods は大域像を有限解像度で近似できる ([Dellnitz–Junge](https://doi.org/10.1016/S1874-575X%2802%2980026-1))。combinatorial enclosure から Morse decomposition を計算する方法も確立している ([Kalies–Mischaikow–VanderVorst](https://doi.org/10.1007/s10208-004-0163-9))。ただしブラウザで任意の高次元系へ適用する万能分析器ではなく、低次元、reduced coordinates、またはbuild-time artifactに限定するのが現実的である。

分岐の局所理論とcontinuationの標準的範囲は [Kuznetsov](https://doi.org/10.1007/978-3-031-22007-4)、無限次元問題にも現れるsimple-eigenvalue bifurcationの古典的結果は [Crandall–Rabinowitz](https://doi.org/10.1016/0022-1236%2871%2990015-2) を参照した。長時間平均の根拠は [Birkhoffのergodic theorem](https://doi.org/10.1073/pnas.17.12.656) に遡り、測度・mixing・entropyを含む標準的体系は [Cornfeld–Fomin–Sinai](https://doi.org/10.1007/978-1-4615-6927-5) にまとめられるが、有限sampleにこれらを無条件適用しない。Markov process / semigroupには [Ethier–Kurtz](https://doi.org/10.1002/9780470316658)、symbolic codingの強い成立範囲にはAxiom A系の [BowenのMarkov partition](https://doi.org/10.2307/2373370) が基準になる。computational topologyの実装基盤は [Kaczynski–Mischaikow–Mrozek](https://doi.org/10.1007/b97315)、scalar fieldのMorse–Smale complexは [Edelsbrunner–Harer–Zomorodian](https://doi.org/10.1007/s00454-003-2926-5) に代表される。

### 3.3 比較からの判断

1. **共通形式には evolution semantics の和型を採る。** 位相力学系は deterministic map / flow / semiflow の強い共通語彙だが、random、Markov、hybridを曖昧に包まない。
2. **Conley系は大域 portrait の最有力だが optional。** recurrent pieces と connections を、個別モデル名に依存せず記述できる。一方、軌跡一本からは計算できず、全30作品の必須出力にはできない。
3. **統計・スペクトルを大域位相骨格の代用品にしない。** invariant measure、Koopman mode、DMDは別の観点であり、互いに検証を肩代わりしない。
4. **category theory はcomposition層に限定する。** open system やnetworkの接続契約には有用だが、作品の主像を決定する分類器にはしない ([Baez–Pollard](https://doi.org/10.1142/S0129055X17500283))。

---

## 4. 採用する数学的基盤

### 4.1 役割別の構成

| 役割             | 採用する既存枠組み                                                                                          | DynaMusiumでの責任                                                     | 必須性                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| 最上位の共通形式 | maps、flows、semiflows、processes、cocycles、Markov semigroups、hybrid inclusions                           | timeとevolution lawの意味を型で固定                                    | 全作品必須                           |
| state-space      | Euclidean / manifold / function / history / lattice / graph-product / particle configuration / finite-state | 「fieldかnetworkか」と「ODEか確率過程か」を直交させる                  | 全作品必須                           |
| 大域骨格         | chain recurrence、Conley theory、finite Morse decomposition / graph                                         | recurrent sets、transient、attractor–repeller、connections             | 能力ベース                           |
| 局所 regime      | differentiable dynamics、linearization、Lyapunov / Floquet、invariant manifolds                             | stabilityとlocal timescale                                             | 適用可能時                           |
| parameter regime | bifurcation theory、numerical continuation                                                                  | qualitative change と branch evidence                                  | parameter作品                        |
| 長時間統計       | empirical / invariant measures、ergodic theory、correlation、mixing、entropy                                | residence、transport、uncertaintyを定量化                              | statistical claim時                  |
| 高次元時間構造   | Koopman / transfer operators、DMD / EDMD                                                                    | frequency、decay、coherent temporal modes                              | residual検証時                       |
| 計算・数値近似   | problem-appropriate solver / evaluator / sampler、set-oriented enclosure、computational topology            | reviewed law / datasetからraw resultを作り、derived objectへ証拠を付す | execution methodは必須、解析器は任意 |

この構成は理論の「合成による新理論」ではない。一作品について利用可能な既存分析を capability として束ねる engineering architecture である。

### 4.2 対象familyをどう収容するか

| 対象                                 | Formal evolution                                          | State-space representation              | 実用portrait                                                                 |
| ------------------------------------ | --------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| autonomous ODE                       | flow（backward uniquenessを使わない場合はsemiflowでも可） | Rⁿ / manifold                           | orbit、equilibria、periodic orbit、stability、recurrence                     |
| discrete map                         | map with discrete time                                    | Euclidean / manifold / finite-state     | iterates、periodic points、symbolic code、invariant measure                  |
| PDE                                  | 通常semiflow。可逆PDEならflow                             | function spaceを数値grid / basisで表現  | field frames、interfaces、statistics、coherent modes                         |
| delay differential equation          | history space上のsemiflow / nonautonomous process         | C([−τ,0],Rⁿ)等のhistory                 | current observable、history-dependent stability、periodic / recurrent regime |
| stochastic differential / random map | pathwiseにはrandom cocycle、lawにはMarkov semigroup       | Euclidean / function space + noise base | sample path、ensemble、stationary measure、random attractor                  |
| hybrid system                        | flow / jump inclusion                                     | continuous state × discrete mode        | flow segments、events、guards / resets、reachability evidence                |
| particle / agent system              | lawに応じmap / flow / cocycle / hybrid                    | particle configuration                  | collective observable、clusters、flux、empirical measure                     |
| network dynamics                     | lawに応じmap / flow / Markov                              | graph-product state space               | node state、edge flux、synchrony、network modes                              |
| high-dimensional system              | 元のevolution classを保持                                 | high-dimensional vector / field         | declared observable、projection、empirical statistics、validated modes       |

particle、agent、network、field、high-dimensionalは、それだけではdynamicsのclassではない。同じnetworkでもKuramoto ODE、epidemic CTMC、event-driven spiking hybrid systemがあり得る。この直交性をschemaで保つ。

delay systemをhistory space上のsemiflowとして扱う標準的定式化は [Hale–Verduyn Lunel](https://doi.org/10.1007/978-1-4612-4342-7) に基づく。delayを有限個の追加変数へ無注記で置き換えるのではなく、近似した場合はreduced-modelとして遅延履歴と誤差を明示する。

### 4.3 重要な境界

- **形式クラスと表現を分離する。** Kuramotoは torus 上の network ODE、FPUTは Euclidean phase space上の particle Hamiltonian ODE、Gray–Scottは function space上の PDE semiflow である。“network / particle / field renderer” は formal classではない。
- **orbitはportraitの証拠であって、portrait全体ではない。** 有限軌跡を chaotic attractor、basin、invariant measure と自動命名しない。
- **Morse graphのedgeはfluxではない。** partial order または接続可能性であり、遷移確率や物質流量を表す線幅には使わない。
- **empirical measureはinvariant measureではない。** burn-in、window、bin / kernel、ensemble、収束を記録し、理論的保証がある場合だけ invariant とする。
- **DMD modeはKoopman modeではない。** reconstruction / residual / holdout と observable dictionary は最低限必要だが十分条件ではない。通常は “approximate Koopman spectral object under the declared observables” までに留める。
- **review済みlaw / datasetが第一の真実源。** governing-equation / reduced numerical作品ではsolver、closed-formではanalytic evaluator、data-derivedではdataset + samplerを使う。set-oriented analysis、topology、statisticsは、そのrunとprovenanceから派生する。

### 4.4 capability方式

作品は次のような capability を持てるが、空のplaceholderを返してはならない。

| capability          | 返せる最低条件                                                                          |
| ------------------- | --------------------------------------------------------------------------------------- |
| local-stability     | equilibrium / periodic orbit、Jacobianまたはvariational equation、residual              |
| recurrence          | orbit returnかchain recurrenceか、return / chain definition、tolerance、window、burn-in |
| morse-decomposition | domain、grid / enclosure、resolution、isolating evidence                                |
| empirical-measure   | estimator、burn-in、window / ensemble、normalization、sampling convergence              |
| invariant-measure   | empirical-measureの条件に加え、invariance / stationarityの理論または数値証拠            |
| spectrum            | observable、sampling interval、window、rank、residual                                   |
| bifurcation         | continued branchまたはvalidated sweep、event criterion                                  |
| field-structure     | actual field frame、coordinates、boundary、threshold / extraction method                |
| conservation        | invariant formula、initial value、absolute / relative residual                          |
| stochastic          | law、interpretation、PRNG、seed、ensemble definition                                    |

「未対応」は科学的に正常な状態である。すべてのカードを埋めることより、証拠のないカードを出さないことを優先する。

---

## 5. 統合された Dynamical Portrait の構造

### 5.1 portraitの単位

Dynamical Portrait はモデルに永久固定された分類札ではない。parameter regime、domain、initial condition / ensemble、observable、時間窓、数値解像度に依存する、スコープ付き・証拠付きの view model である。

| 層                         | 内容                                                                                  | 禁止事項                                                                |
| -------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Formal Class               | state space、time type、evolution semantics、law、deterministic / stochastic / hybrid | renderer名や見た目でclassを決めない                                     |
| Computation / Evidence Run | raw trajectory / field frames / event log / ensemble、method provenance、failure      | non-finite、divergence、constraint violationをclampで隠さない           |
| Global Portrait            | chain recurrent approximation、Morse sets、connections、attractor / repeller、basins  | 一軌跡から大域集合を断定しない                                          |
| Local Regime               | equilibrium / periodic orbit、stability、eigenvalues、manifolds、local timescales     | projection上の傾きからstabilityを推測しない                             |
| Statistical Portrait       | empirical / invariant measures、recurrence、correlation、entropy、uncertainty         | histogramを自動的にinvariant measureと呼ばない                          |
| Spectral Portrait          | Koopman / DMD modes、frequency、growth / decay、residual                              | fitの良さを示さず物理modeと断定しない                                   |
| Parameter Portrait         | regimes、branches、bifurcations、hysteresis                                           | sliderの見た目の急変だけでbifurcationと呼ばない                         |
| Scientific Objects         | 上記のうち作品が表示する有限個のobject + evidence                                     | geometryやCSS tokenを含めない                                           |
| Semantic Visual Layers     | object / quantity を固定された visual channel に結合                                  | composition実装がsource、sign、scale、directionを変更できるようにしない |
| Composition                | spacing、camera、light、typography、material、staging、ambient layer                  | 科学レイヤーの意味を上書きしない                                        |

### 5.2 evidence ladder

各 Scientific Object は少なくとも次を持つ。

- **claim**: 何が科学的に主張されるか
- **scope**: parameter、domain、initial / ensemble、time window、resolution
- **method**: theoretical、direct numerical、set-oriented、statistical、spectral、topological
- **status**: observed、estimated、numerically-checked、reference-compared、rigorously-enclosed
- **evidence**: residual、step-halving、reference、confidence interval、isolating enclosure等
- **limitations**: finite time、projection、finite-N、threshold dependence等

表示名の規則は厳密にする。

| 計算したもの              | 許される名前                            | 証拠なしでは避ける名前      |
| ------------------------- | --------------------------------------- | --------------------------- |
| 有限時間の状態列          | trajectory sample / orbit segment       | attractor                   |
| burn-in後の有限 histogram | empirical occupancy / empirical measure | invariant measure           |
| finite-rank DMD           | DMD mode / fitted frequency             | Koopman eigenmode           |
| box graphのSCC            | recurrent candidate at resolution h     | exact chain component       |
| scalar gradientの分割     | Morse–Smale cells                       | Conley Morse sets           |
| synthetic formula texture | illustrative surrogate                  | governing-equation solution |

### 5.3 science maturity

一軸の「正しさ点数」ではなく、表現種別と検証段階を併記する。

**representation**

- governing-law-execution（ODE / map / PDE / stochastic / hybrid）
- closed-form-solution
- reduced-model
- data-derived
- illustrative-surrogate

**maturity**

- **M0 — Unvalidated / illustrative:** contractまたは検証が未完。representationがsurrogateなら支配方程式の解とは主張しない
- **M1 — Equation-consistent:** law、state、units、表示observableが一致し、有限値・constraint failureを表面化
- **M2 — Numerically checked:** step refinement、残差、solver適合性を確認
- **M3 — Reference validated:** invariant / conservation / positivity / known trajectory or statistic / benchmark と照合
- **M4 — Rigorous enclosure:** interval、computer-assisted proof、validated topology等。展示の通常要件ではない

M4を全作品の目標にしない。公開する governing-equation作品は原則 M2、flagshipはM3を目標とする。M0も、正確にラベルされ、科学値と装飾値を混同しなければ展示可能である。

Maturityは累積gateであり、上位levelは下位の要件を置き換えず全て満たす。EvidenceStatusは個々のobject evidenceに付き、run全体のMaturityとは別に記録する。

---

## 6. 数学的対象と美術表現の対応

### 6.1 共通原則

1. 一作品のactive parameter regimeにつき、Observeの主像が伝える **primary scientific truthを一つ**選ぶ。
2. position、distance、direction、density、width、frequency、decay、boundary の意味対応を manifest で固定する。
3. 別のobservableや検証量はStudyへ送る。すべてのstate variableを主像へ重ねない。
4. 高次元系は、科学的理由のあるprojection / observable / modeへ落とす。次元数を理由に3D化しない。
5. 科学的layerと atmospheric layerを別オブジェクト、別DOM / Canvas pass、別accessibility semanticsにする。装飾noiseはscientific uncertaintyではない。
6. Exhibitは同じ科学layerを時間的にreveal / dwell / recedeさせる。新しいdataや存在しないtransitionを演出で発明しない。
7. reduced motionでは情報を消さず、motion channelをaccumulation、small multiples、density、static phase marksへ置換する。
8. 長時間展示では粒子数・trail長・density normalizationを有界にし、loop seam、random walk drift、徐々に白飛びする加算blendを許さない。

以下の表は一つの固定rendererを要求するものではない。object-to-channelの意味契約であり、現在の細線、抑制されたglow、余白、trace stripの中で実現できる。

### 6.2 大域・幾何学的対象

| 数学的対象           | 科学的意味                                                                                                                                        | Observeの主像                                                                                                  | Studyで示す根拠                                                                                                                           | Exhibitの時間演出                                                       | 適切なvisual channel                                     | 避けるべき誤解                                                                                   | reduced-motion                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Recurrent set        | orbit recurrenceは軌道が任意に近く戻る点 / 集合、chain recurrenceは任意精度のpseudo-orbitで戻る点 / 集合。後者は一般に大きく、subtypeを必須にする | 実際の再訪が支持された領域、またはchain enclosureを別表示                                                      | orbit returnならmetric / return time、chainならε / minimum time / grid resolution / multivalued-map SCC                                   | transientを退かせ、どちらのrecurrenceかをcaptionで固定してsupportを蓄積 | occupancy / return marks、またはenclosed cells / contour | orbit recurrenceとchain recurrenceを混同しない。有限時間の濃い場所をexact setと呼ばない          | final support + return locations / enclosed cells |
| Fixed point          | evolutionで不変な状態                                                                                                                             | 小さな静止核。安定・不安定方向が主題なら細い局所軸                                                             | residual、Jacobian eigenvalues、solver tolerance                                                                                          | 周囲のsampleが接近 / 離脱し、核は動かさない                             | position、glyph、local direction、decay rate             | 画面中央を固定点と見なさない。projectionを明記                                                   | 静的sample vectors / before-after dots            |
| Periodic orbit       | 一定周期後に同じ状態へ戻る閉軌道                                                                                                                  | 一周する閉曲線と一個の位相marker                                                                               | shooting / return residual、period、Floquet multipliers                                                                                   | 一周期単位で呼吸し、周期境界で継ぎ目を出さない                          | closed path、phase position、periodic timing             | 画面上で閉じたprojectionを真の周期軌道と断定しない                                               | 位相ticks、周期のsmall multiples                  |
| Quasiperiodic set    | 非可約な複数周波数をもつtorus型運動                                                                                                               | 低次元projectionのwoven orbitまたは位相対                                                                      | frequency peaks、incommensurability evidence、torus coordinates                                                                           | beatが長時間でずれることを急がず見せる                                  | phase、frequency、lissajous / torus projection           | 見た目の複雑さをchaosと呼ばない                                                                  | phase gridとspectrum                              |
| Chaotic attractor    | attracting invariant set上で非周期的・初期値鋭敏な運動                                                                                            | 証明 / validated enclosureがなければ “chaotic attracting-regime candidate” のorbit segment + empirical support | trapping / invariance / attractionの根拠と、別にLyapunov / entropy / symbolic等のchaos evidence。dissipativityとboundednessだけでは不十分 | 同じsupportを壊さず異なるsegmentを巡る                                  | path、occupancy、separation inset                        | finite-time Lyapunovや有限polylineだけでattractor / chaosを確立しない。装飾jitterをchaosにしない | empirical support + paired divergence samples     |
| Transient            | recurrent / asymptotic regimeへ至る有限時間過程                                                                                                   | 主像へ入る薄い導入path。recurrent layerと材質を分ける                                                          | burn-in criterion、distance / residual、exit time                                                                                         | 一度だけ現れ、蓄積せず静かに退く                                        | opacity、path age、time-to-entry                         | transientをattractorの一部として塗り潰さない                                                     | start/endと中間ghosts                             |
| Attractor / repeller | 近傍を将来 / 過去へ引きつけるinvariant set                                                                                                        | attractorは集束density、repellerは離脱方向。必要なら別scene                                                    | trapping / repelling neighborhood、basin samples、Conley evidence                                                                         | attractorへslow gather、repellerからcontrolled release                  | convergence direction、density、boundary                 | forward sampleだけでrepeller全体を描かない                                                       | seed群のbefore-after                              |
| Morse set            | 有限Morse decompositionのisolated recurrent piece                                                                                                 | 一個ずつの静かなisland / contour。形は計算領域に従う                                                           | enclosure、resolution、isolating neighborhood、index optional                                                                             | island間を急いで移動せず、connection順にdwell                           | bounded region、identity hue + label                     | islandの面積を重要度や確率と解釈させない                                                         | 全island + partial order                          |
| Morse graph          | Morse sets間のgradient-like partial order                                                                                                         | nodeを余白のある関係図としてStudy寄りに表示                                                                    | multivalued map、connection evidence、resolution                                                                                          | topological orderに沿いfocusを移す                                      | node-link、arrow direction、no weighted width            | edgeをtransition probability / physical fluxとしない                                             | 静的DAG + focus outline                           |
| Invariant manifold   | invariant setへ接近 / 離脱する状態集合                                                                                                            | 計算された局所 / global manifoldの細いsheet / curve                                                            | tangent eigenspace、continuation、invariance residual                                                                                     | seedがmanifoldに沿う様子だけを短く示す                                  | tangent direction、curve / sheet                         | projection artifactや任意streamlineと混同しない                                                  | manifold + tangent markers                        |
| Basin of attraction  | 初期条件を同じattractorへ運ぶ領域                                                                                                                 | state-space sliceの低彩度領域、attractorは小さく明瞭に                                                         | sampling domain、classifier、uncertain cells、resolution                                                                                  | seed pointsを少数だけ追跡し、境界は固定                                 | categorical region、boundary、uncertainty hatch          | basin volumeをprobabilityと呼ばない。sliceを全空間としない                                       | static basin map + destinations                   |
| Separatrix           | 異なる運命 / flow regimeを分けるinvariant boundary                                                                                                | 薄い境界線と両側の少数sample                                                                                   | stable manifold / scalar saddle、integration direction、residual                                                                          | 両側sampleが異なる先へ離れる                                            | boundary position、direction                             | 単なるcolor contourをdynamical separatrixと呼ばない                                              | boundary + paired arrows                          |

### 6.3 統計・スペクトル・parameter対象

| 数学的対象        | 科学的意味                                                                  | Observeの主像                                                                                              | Studyで示す根拠                                                                            | Exhibitの時間演出                                                  | 適切なvisual channel                                                                  | 避けるべき誤解                                                      | reduced-motion                                |
| ----------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| Invariant measure | evolutionで不変な確率measure                                                | declared bins / kernel / reference measure上のprobability mass estimate。理論保証がなければempiricalと明記 | estimator、reference measure、burn-in、window / ensemble、normalization、stationarity test | mass estimateを累積し、収束後はゆっくりdwell                       | probability mass、quantile / support contours。singular measureに面積密度を強制しない | brightnessを「好ましさ」にしない。有限histogramを不変と断定しない   | final mass estimate + sample count            |
| Recurrence        | 状態が過去の近傍へ戻るevent / 統計                                          | orbit上の控えめなreturn pulsesまたはrecurrence strip                                                       | metric、embedding、threshold、return-time distribution                                     | real return timeに同期。装飾周期を加えない                         | event marks、recurrence matrix、interval                                              | plot textureをchaosの証明にしない                                   | static recurrence plot / interval histogram   |
| Entropy           | 指定したtopological / measure-theoretic / partition-based定義での情報生成率 | 通常はStudy中心。primaryなら定義済みpartitionのsymbol growth / calibrated estimate                         | entropy definition、partition / generating assumption、estimator、sample size、confidence  | estimatorのwindowを段階表示するがrandom flickerへ置換しない        | numeric position、symbol count / interval                                             | 視覚的noiseの量をentropyと同一視しない。異なるentropy定義を混ぜない | estimate + confidence / partition summary     |
| Mixing            | observablesやsetsの長時間相関が失われ、measureに従って混ざる性質 / rate     | 複数ensembleの区別と重なりを、測定量があるときだけ主像にする                                               | mixing notion、invariant measure、correlation / transfer estimate、lag、uncertainty        | measured correlation decayに合わせてensemble distinctionを失わせる | overlap、correlation opacity、lag position                                            | 単に散らばることやdiffusionをmixingの証明としない                   | lag-correlation curve、before/after ensembles |
| Koopman mode      | 指定observableの固有時間成分とspatial / state pattern                       | 一度に一modeだけ、係数とpatternを連動                                                                      | observable、dictionary、eigenvalue、residual、reconstruction、holdout                      | fitted frequency / decayだけでmode amplitudeを変える               | signed pattern + amplitude + phase                                                    | 全stateの固有mode、物理固有modeと無条件に呼ばない                   | positive/negative lobes + phase snapshots     |
| Frequency         | 周期 / quasiperiod / modeの時間率                                           | primary truthならpulseではなくphase progressionまたはspectrum peak                                         | sampling、window、aliasing、uncertainty                                                    | dataのfrequencyに同期し、flashを強くしない                         | phase angle、spacing、spectral position                                               | frame rate / animation speedと物理frequencyを混同しない             | phase ticks / spectrum                        |
| Decay rate        | perturbation / mode amplitudeの指数的または他の減衰                         | trace envelopeが主像を静かに収束させる                                                                     | fit interval、model、confidence、eigenvalue / correlation                                  | wall-clock演出は単調変換しても凡例でsimulation timeを保持          | envelope、opacity / width with labeled scale                                          | aesthetic fadeを科学的decayと見せない                               | log-amplitude line + start/end                |
| Bifurcation       | parameter変化でinvariant objectやstabilityが質的に変わる                    | 現regimeの主像。全branch図はStudyへ                                                                        | continuation、branch、stability、critical parameter、hysteresis direction                  | critical point前後を別のvalidated statesとしてcrossfade            | branch position、stability style、regime labels                                       | slider中の一時的変化をbifurcationと断定しない                       | critical before/after small multiples         |
| Uncertainty       | initial、parameter、model、numerical、stochasticの不確かさ                  | 主対象の周囲に由来別のband / ensemble support                                                              | source、distribution / bounds、propagation、confidence / credible level                    | seed固定のensembleを同期させ、random shimmerを使わない             | interval、band、hatch、ensemble density                                               | 装飾noiseをuncertaintyと呼ばない。種類を混ぜない                    | band / quantiles                              |
| Ensemble          | 同じlawのinitial / noise / parameter samplesの集合                          | 個々の細線より分布の輪郭を主にする                                                                         | sampling design、N、seed set、weighting                                                    | 同一simulation timeで同期、個体を恣意的に選ばない                  | density、quantiles、small multiples                                                   | ensemble spreadを一軌跡の時間変化としない                           | quantile contours + representative members    |

### 6.4 保存・flux・field対象

| 数学的対象         | 科学的意味                                                                                  | Observeの主像                                                                                                             | Studyで示す根拠                                                                                    | Exhibitの時間演出                                                      | 適切なvisual channel                                    | 避けるべき誤解                                                      | reduced-motion                                       |
| ------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| Conservation law   | closed systemのstrict invariant、またはsource / sink / boundaryを含むlocal / global balance | strict invariantなら総量を固定frameにして内部再配分を動かす。open systemならinflow / storage / outflow budgetを主像にする | exact balance formula、boundary / forcing assumptions、initial value、absolute / relative residual | strict invariantの総枠は動かさない。open balanceは実fluxに従って変える | partition / budget、signed flux、residual trace         | open systemのstorageを一定と見せない。clampで見かけの保存を作らない | static budget keyframes + residual                   |
| Flux               | boundary / edgeを横切る単位時間当たりの輸送                                                 | direction付きchannel。幅とemission frequencyはinstantaneous rate、cumulative particle countはtime-integrated rate         | sign convention、units、discrete balance、source / sink、phase accumulator                         | 実fluxを時間積分したaccumulatorが閾値を越えた時だけeventを送る         | width、direction、event frequency / count、signed label | particle speedや一粒の大きさをfluxにしない。Morse edgeと混同しない  | width、chevron、numeric rateとcumulative countを保持 |
| Spatial field      | domain上のscalar / vector / tensor quantity                                                 | 座標を保つfield plane。一時刻の一quantityを主にする                                                                       | grid、coordinates、units、boundary、time、interpolation、color scale                               | actual framesだけをsimulation timeに同期                               | luminance / hue、contour、glyph for vector              | row / columnをtimeにしない。非一様warpを無注記でしない              | selected frame + time small multiples                |
| Interface          | phase / material / concentrationの境界                                                      | threshold / level-setに由来する細い輪郭                                                                                   | field、threshold、gradient、grid convergence、interface width                                      | actual motion / coarseningを追跡し、輪郭を補間で発明しない             | contour position、line width if physical                | arbitrary contrast edgeを物理interfaceとしない                      | initial/final contours + displacement arrows         |
| Defect             | order parameterのzero / singularity / topological charge                                    | 背景fieldを抑え、defect coreを小さく明瞭にする                                                                            | detection rule、charge / winding、resolution、creation / annihilation balance                      | real event時だけ生成・消滅                                             | point / line identity、signed glyph                     | bright speckをdefectと呼ばない。grid artifactを除く                 | core map + event ledger                              |
| Coherent structure | 一定時間まとまりを保つmaterial / spectral / transfer structure                              | 一つのstructureを輪郭と内部motionの差で示す                                                                               | definition（vortex、LCS、DMD等）、window、residual / coherence score                               | coherence window内だけ追跡し、外では静かに解く                         | contour、relative motion、mode amplitude                | きれいなblobを自動的にcoherentと呼ばない                            | tracked contours at key times                        |

### 6.5 Observe / Study / Exhibit の責任

- **Observe:** primary claimに必要なsemantic layerを1–3枚だけ示す。equation名より現象が主役。短い caption は「何を見るか」と「何を見ていないか」を言う。
- **Study:** equation、state / parameter / units、projection、solver、step / tolerance、boundary / initial condition、seed、evidence、failure、maturity、sourceを示す。generic diagnostics stringではなく、主張ごとの根拠を表示する。
- **Exhibit:** Observeの同じデータを、長いdwell、抑制したtransition、chrome recessionで展示する。scientific timeとwall-clock stagingを別に持ち、後者がfrequency / decay / fluxの意味を変えない。

### 6.6 Compositionの責任境界（特定ツール非依存）

この境界はFableその他の特定ツールを前提にしない。compositionは、人手で書いたReact / CSS / SVG / Canvas、通常のdesign system、外部のauthoring tool、将来の生成支援のいずれでもよい。どの実装も同じComposition contractのconsumerであり、DynaMusiumのruntime要件ではない。

composition実装は次を決定できる。

- composition、余白、z-order。camera / cropはsemantic layerが宣言したsafe viewport内だけ
- lighting、glow、material、textureはsemantic style bounds内だけ。semantic layerを覆わない
- typography、caption hierarchy、Study panel layout
- wall-clock easing、reveal order、dwell、scene transition
- nonsemantic atmosphere。必ず独立layer、aria-hiddenとし、randomnessを使うならscientific seedとは別のdecorative seedを持つ

composition実装は次を変更できない。

- scientific objectのsource、quantity、observable、sign、unit
- visual channelの意味（例: width=flux、density=measure）
- scale type、domain、zero、clipping policy、uncertainty convention
- direction、topology、projection、coordinate aspect ratio
- scientific timestamp、frequency、decay、event order
- evidence status、maturity、failure state

Composition は semantic layer のIDと、そのlayerが公開するsafe viewport / style boundsだけを参照し、data transformを持たない。型だけで知覚上の歪みを完全には防げないため、runtime validator、visual regression、science / accessibility reviewも必須にする。designerまたはauthoring toolが別channelを望む場合は、science ownerが visual mappingをreviewして新versionを作る。

Fable 5を将来選択する場合も、この任意adapterの一実装にすぎない。Fableがなくても全作品の計算、semantic mapping、現行museum UI、手書きcompositionは完結する。

---

## 7. DynaMusium用 schema / TypeScript設計

### 7.1 最小設計

現行30作品の移行に、汎用数学DSLやcategory-theoretic compilerは不要である。既存 manifestへ次の4項目を追加し、実行結果をdiscriminated unionにする。

1. formal — state spaceとevolution semantics
2. parameterRegimes / primaryClaims — active regimeごとに一つの主張
3. numerics / science — solver provenance、validation、representation、maturity
4. portrait / visualMappings — 計算可能なobjectと固定channel

既存の gallery、title、curator note、question、citations、presets、controlsはそのまま残す。

### 7.2 Formal Class

```ts
type ContinuousTime = { kind: 'continuous'; unit: string };
type DiscreteTime = { kind: 'discrete'; stepLabel: string };
type TimeDomain = ContinuousTime | DiscreteTime;

interface CoordinateSpec {
  id: string;
  unit: string;
  period?: number;
}

type StateSpace =
  | {
      kind: 'euclidean';
      dimension: number;
      coordinates: CoordinateSpec[];
      constraints?: string[];
    }
  | {
      kind: 'manifold';
      dimension: number;
      manifoldRef: string;
      coordinates: CoordinateSpec[];
      topology: string;
    }
  | {
      kind: 'field';
      domain: {
        dimension: 1 | 2 | 3;
        axes: Array<{
          id: string;
          unit: string;
          extent: [number, number];
          periodic: boolean;
        }>;
      };
      components: string[];
      functionSpace?: string;
      boundary: BoundaryCondition[];
    }
  | {
      kind: 'lattice' | 'graph-product' | 'particle-configuration';
      sites: number;
      componentPerSite: string[];
      topology?: string;
    }
  | {
      kind: 'history';
      horizon: { value: number; unit: string };
      baseStateRef: string;
      functionSpace?: string;
    }
  | {
      kind: 'finite-state';
      description: string;
    };

type DeterministicEvolution =
  | { kind: 'map'; time: DiscreteTime; autonomous: true; lawRef: string }
  | { kind: 'flow' | 'semiflow'; time: ContinuousTime; autonomous: true; lawRef: string }
  | {
      kind: 'process';
      time: TimeDomain;
      autonomous: false;
      lawRef: string;
      forcing: { kind: 'periodic' | 'recorded' | 'formula'; ref: string };
    };

interface RandomCocycleView {
  cocycleRef: string;
  baseFlowRef: string;
  interpretation?: 'ito' | 'stratonovich' | 'discrete';
}

interface MarkovLawView {
  operatorRef: string;
  generatorRef?: string;
  transitionKernelRef?: string;
}

type StochasticViews =
  | { pathwise: RandomCocycleView; law?: MarkovLawView }
  | { pathwise?: RandomCocycleView; law: MarkovLawView };

type StochasticEvolution = {
  kind: 'stochastic';
  time: TimeDomain;
  lawRef: string;
  noiseLawRef: string;
} & StochasticViews;

interface HybridEvolution {
  kind: 'hybrid';
  flowTime: ContinuousTime;
  flowRef: string;
  jumpRef: string;
  flowSetRef: string;
  jumpSetRef: string;
  stochastic?: { noiseLawRef: string; transitionKernelRef?: string };
}

type FormalClass = {
  stateSpace: StateSpace;
} & (
  | { character: 'deterministic'; evolution: DeterministicEvolution }
  | { character: 'stochastic'; evolution: StochasticEvolution }
  | { character: 'hybrid' | 'stochastic-hybrid'; evolution: HybridEvolution }
);
```

lawRefはmanifest内の任意式評価ではなく、review済みruntime registryのidentifierである。CSP、安全性、再現性を保ち、equationをReactへ重複させない。

random cocycleとMarkov lawは排他的なclassではない。同じSDEをpathwise cocycleと分布レベルのMarkov semigroupの両方から見られるため、stochastic branchは両viewを同時に持てる。JSON Schemaのconditional validationでも、map↔discrete time、flow / semiflow↔continuous time、character↔evolution kind、stochastic-hybrid↔noise specificationの整合を強制する。

### 7.3 manifest

```ts
type Representation =
  | 'governing-law-execution'
  | 'closed-form-solution'
  | 'reduced-model'
  | 'data-derived'
  | 'illustrative-surrogate';

type Maturity = 'M0' | 'M1' | 'M2' | 'M3' | 'M4';

interface ParameterRegimeSpec {
  id: string;
  presetIds?: string[];
  parameterDomain: Record<string, [number, number]>;
  note: string;
}

interface PrimaryClaimSpec {
  id: string;
  appliesToRegimeIds: string[];
  statement: string;
  objectKind: ScientificObject['kind'];
  observableIds: string[];
  limitations: string[];
  targetMaturity: Maturity;
}

type WorkManifestV2 = Omit<
  WorkManifest,
  'schemaVersion' | 'runtime' | 'kernel' | 'render' | 'equation'
> & {
  schemaVersion: 2;
  formal: FormalClass;
  definition: {
    definitionRef: string;
    expectedHash: ContentHash;
    explanation: string;
  };
  parameterRegimes: ParameterRegimeSpec[];
  primaryClaims: PrimaryClaimSpec[];
  science: {
    representation: Representation;
    capabilities: PortraitCapability[];
    validations: ValidationRequirement[];
  };
  runtime: {
    kind: 'ode' | 'map' | 'field' | 'stochastic' | 'hybrid' | 'analytic' | 'surrogate';
    kernel: string;
    executionProfile: string;
  };
  visualMappings: SemanticVisualLayer[];
};
```

runtime.kind と formal.evolution は同一概念ではない。たとえば PDE semiflowは formalには semiflow、実装runtimeは field。periodically forced reaction chainは formalには process、runtimeは odeである。

canonical equation、state variables、units、boundary / forcing semanticsはruntime registryのdefinitionRefから取得する。manifestは同じ式を自由文で再入力せず、visitor向けexplanationとexpectedHashだけを持つ。run開始時にregistry definition hashと照合し、equation–kernel–display driftを拒否する。

### 7.4 数値結果

```ts
interface ContentHash {
  algorithm: 'sha256';
  value: string;
}

interface RunIdentity {
  requestId: string;
  runId: string;
  workSlug: string;
  schemaVersion: 2;
  manifestHash: ContentHash;
  inputHash: ContentHash;
  resolvedPresetId?: string;
  resolvedParameters: Record<string, number>;
}

interface RunProvenance {
  kernel: { id: string; version: string; definitionHash: ContentHash };
  execution:
    | {
        kind: 'numerical-solver';
        id: string;
        version: string;
        precision: 'float64' | 'float32';
        fixedStep?: number;
        relativeTolerance?: number;
        absoluteTolerance?: number;
      }
    | {
        kind: 'analytic-evaluator' | 'surrogate-evaluator';
        id: string;
        version: string;
        formulaHash: ContentHash;
      }
    | {
        kind: 'data-sampler';
        id: string;
        version: string;
        datasetHash: ContentHash;
        licenseRef: string;
      };
  interval: [number, number];
  initialCondition: Record<string, number> | { ref: string };
  boundaryConditions?: BoundaryCondition[];
  grid?: { shape: number[]; spacing: number[] };
  random?: {
    algorithm: string;
    version: string;
    seed: string;
    sampleSchedule: string;
    ensembleSize?: number;
  };
}

interface ObservableSeries {
  id: string;
  label: string;
  unit: string;
  values: Float64Array;
}

interface FieldFrame {
  time: number;
  shape: [number, number] | [number, number, number];
  components: Record<string, Float32Array | Float64Array>;
  coordinates: { names: string[]; spacing: number[] };
}

type SingleRunPayload =
  | {
      kind: 'trajectory';
      times: Float64Array;
      state?: Float64Array;
      stateShape?: [number, number];
      observables: ObservableSeries[];
    }
  | {
      kind: 'field-trajectory';
      times: Float64Array;
      frames: FieldFrame[];
      observables: ObservableSeries[];
    }
  | {
      kind: 'event-trajectory';
      times: Float64Array;
      observables: ObservableSeries[];
      events: HybridEvent[];
    };

type RunPayload =
  | SingleRunPayload
  | {
      kind: 'ensemble';
      members: Array<{
        memberId: string;
        weight: number;
        payload: SingleRunPayload;
      }>;
      summary: EnsembleSummary;
    };

type WorkRunResult =
  | {
      status: 'valid';
      identity: RunIdentity;
      payload: RunPayload;
      provenance: RunProvenance;
      hardChecks: RunCheckResult[];
      claimAssessments: ClaimAssessmentResult[];
    }
  | {
      status: 'invalid';
      identity: RunIdentity;
      provenance: RunProvenance;
      failure: {
        kind:
          | 'non-finite'
          | 'divergence'
          | 'hard-constraint-violation'
          | 'dimension-mismatch'
          | 'step-underflow'
          | 'event-failure';
        message: string;
        time?: number;
        stateIndex?: number;
      };
      lastAcceptedTime?: number;
    };
```

重要なのは points を廃止することである。モデルは描画geometryを返さず、state / observable / field / eventを返す。fieldは単一frameではなく、各frameが明示的なtimeを持つ。validatorはouter times[i] = frames[i].time、frame count、component shapeを検査し、空間rowからtimesを合成する余地を型とvalidationから除く。

inputHashはresolved parametersだけでなく、manifest / law / dataset、initial / boundary conditions、execution profile、seed / sample scheduleをcanonical encodingして求める。worker responseはrequestIdとinputHashがactive requestに一致するときだけ採用する。

invalid resultは再生・描画しない。parameter変更中に旧valid resultを残す場合は “last valid result” と明示し、新parameterの作品としては表示しない。旧専用solverの [SimulationResult](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/solver/simulation-result.ts#L42-L44) をmuseum runtimeへ一般化できる。

run validityとclaim maturityを分離する。non-finite、次元不一致、hard invariant / domain violationはrunをinvalidにする。一方、reference statisticやmorphologyの不一致はraw runを捨てず、該当Scientific Objectを抑止し、claimAssessmentとattained maturityを下げる。

### 7.5 Dynamical Portrait と Scientific Object

```ts
type EvidenceStatus =
  'observed' | 'estimated' | 'numerically-checked' | 'reference-compared' | 'rigorously-enclosed';

interface EvidenceMetric {
  id: string;
  value: number;
  unit?: string;
  norm?: 'absolute' | 'relative' | 'l1' | 'l2' | 'linf';
  tolerance?: number;
  referenceValue?: number;
  referenceId?: string;
  confidenceInterval?: [number, number];
}

interface Evidence {
  method:
    | 'theoretical'
    | 'direct-numerical'
    | 'set-oriented'
    | 'statistical'
    | 'spectral'
    | 'computational-topology';
  status: EvidenceStatus;
  scope: {
    runId: string;
    inputHash: ContentHash;
    regimeId: string;
    resolvedParameters: Record<string, number>;
    parameterPreset?: string;
    domain?: string;
    timeWindow?: [number, number];
    resolution?: string;
    observableIds: string[];
  };
  metrics: EvidenceMetric[];
  limitations: string[];
  citationIds?: string[];
}

type ScientificObject =
  | {
      id: string;
      kind:
        | 'orbit-segment'
        | 'fixed-point'
        | 'periodic-orbit'
        | 'quasiperiodic-set'
        | 'transient-segment'
        | 'invariant-manifold'
        | 'basin'
        | 'separatrix';
      geometryRef?: string;
      evidence: Evidence[];
    }
  | {
      id: string;
      kind: 'attractor' | 'repeller';
      dynamicsQualifier:
        | 'equilibrium'
        | 'periodic'
        | 'quasiperiodic'
        | 'chaotic-candidate'
        | 'chaotic-validated'
        | 'unspecified';
      geometryRef: string;
      evidence: Evidence[];
    }
  | {
      id: string;
      kind: 'recurrent-set';
      recurrenceKind: 'orbit' | 'chain';
      geometryRef: string;
      evidence: Evidence[];
    }
  | {
      id: string;
      kind: 'morse-set' | 'morse-graph';
      membersRef: string;
      connectionsRef?: string;
      evidence: Evidence[];
    }
  | {
      id: string;
      kind: 'empirical-measure' | 'invariant-measure' | 'recurrence' | 'mixing' | 'entropy';
      observableRef: string;
      evidence: Evidence[];
    }
  | {
      id: string;
      kind: 'dmd-mode' | 'koopman-mode' | 'frequency' | 'decay-rate';
      observableRef: string;
      spectrumRef: string;
      evidence: Evidence[];
    }
  | {
      id: string;
      kind: 'bifurcation' | 'uncertainty' | 'ensemble' | 'conservation' | 'flux';
      dataRef: string;
      evidence: Evidence[];
    }
  | {
      id: string;
      kind: 'spatial-field' | 'interface' | 'defect' | 'coherent-structure';
      fieldRef: string;
      evidence: Evidence[];
    };

type PortraitAnnotation =
  | {
      kind: 'local-stability';
      subjectObjectId: string;
      linearizationRef: string;
      spectrumRef: string;
      residualRef: string;
    }
  | {
      kind: 'statistical';
      subjectObjectId: string;
      scientificObjectId: string;
    }
  | {
      kind: 'spectral';
      subjectObjectId: string;
      scientificObjectId: string;
    }
  | {
      kind: 'parameter-regime';
      regimeId: string;
      conditionRef: string;
    };

interface DynamicalPortrait {
  runId: string;
  inputHash: ContentHash;
  regimeId: string;
  primaryClaimId: string;
  maturityAssessment: {
    attained: Maturity;
    derivedFromCheckIds: string[];
    reviewed: boolean;
  };
  primaryObjectId: string;
  objects: ScientificObject[];
  annotations: PortraitAnnotation[];
}
```

このunionは数学の完全ontologyではない。現行30作品と近い将来のruntimeに必要なobjectだけを列挙し、新objectはreview付きschema versionで追加する。

geometryRefはscreen-spaceのSVG pathやCanvas座標ではなく、単位・座標系を持つstate-space上のsample / set representationだけを参照する。screen geometryへのprojectionはSemanticVisualLayerが行う。

maturityAssessment.attainedはmanifestの自己申告ではない。ValidationResultとobjectごとのEvidenceStatusから累積gateを機械判定し、review済みの場合だけStudyへ確定値として出す。

### 7.6 semantic visual mapping とcomposition

```ts
type MarkKind =
  'point' | 'path' | 'region' | 'field-raster' | 'contour-line' | 'glyph' | 'particle';

type VisualChannel =
  | 'position-x'
  | 'position-y'
  | 'luminance'
  | 'hue'
  | 'opacity'
  | 'stroke-width'
  | 'area'
  | 'orientation'
  | 'direction'
  | 'event-frequency'
  | 'phase';

interface ChannelBinding {
  quantityRef: string;
  channel: VisualChannel;
  scale: 'linear' | 'log' | 'symlog' | 'categorical' | 'cyclic';
  domain: [number, number] | string[];
  unit?: string;
  zero?: number;
  outOfDomain: 'overflow-indicator' | 'clip-with-indicator' | 'wrap-cyclic';
  uncertaintyRef?: string;
}

interface SemanticVisualLayer {
  id: string;
  objectId: string;
  appliesToRegimeIds: string[];
  mark: MarkKind;
  bindings: ChannelBinding[];
  scientificTime?: {
    quantityRef: string;
    mode: 'frame' | 'cursor' | 'phase';
    interpolation: 'none' | 'linear' | 'declared-method';
  };
  reducedMotion: {
    strategy: 'semantic-static' | 'accumulated-density' | 'keyframes' | 'small-multiples';
    dataRef?: string;
    preserves: string[];
  };
  displayConstraints: {
    viewport: {
      policy: 'fit-declared-domain' | 'safe-crop';
      minimumVisibleFraction: number;
      preserveAspect: boolean;
    };
    style: {
      minimumContrast: number;
      strokeWidthRange?: [number, number];
      maximumGlowRadius?: number;
    };
  };
  projection?: {
    coordinateRefs: string[];
    method: 'identity' | 'selected-coordinates' | 'pca' | 'mode';
    aspect: 'physical' | 'equal-data-units' | 'declared-distortion';
  };
}

interface CompositionSpec {
  layerIds: string[];
  layout: { focalLayerId: string; negativeSpace: number; zOrder: string[] };
  camera?: {
    constraintLayerId: string;
    framing: 'fit' | 'safe-crop';
    motion: 'none' | 'bounded-slow-pan' | 'bounded-slow-zoom';
  };
  lighting: { ambient: string; semanticStyleLayerIds: string[] };
  typography: { titleRole: string; captionRole: string; dataRole: string };
  staging: Array<{
    layerId: string;
    revealAt: number;
    dwell: number;
    wallClockOnly: true;
    transition: 'cut' | 'fade' | 'mask-reveal';
  }>;
  atmosphere?: {
    assetRef: string;
    decorativeSeed?: string;
    nonSemantic: true;
    ariaHidden: true;
  };
}
```

CompositionにquantityRef、channel、domain、unit、projection transformを置かないことが、authoring手段に依存しない第一の境界である。safe viewport / style boundsをvalidatorで検査し、最終的な意味保存はreviewとvisual testでも確認する。

### 7.7 具体例: Lorenz

以下は現行HEADのmaturity宣言ではなく、canonical preset（ρ=28、σ=10）がM3のtarget gatesを満たした後の **target contract** である。

```ts
const lorenzTargetPortraitContract = {
  formal: {
    stateSpace: {
      kind: 'euclidean',
      dimension: 3,
      coordinates: [
        { id: 'x', unit: 'dimensionless' },
        { id: 'y', unit: 'dimensionless' },
        { id: 'z', unit: 'dimensionless' },
      ],
    },
    evolution: {
      kind: 'flow',
      time: { kind: 'continuous', unit: 'model time' },
      autonomous: true,
      lawRef: 'lorenz-1963',
    },
    character: 'deterministic',
  },
  parameterRegimes: [
    {
      id: 'canonical-rho-28',
      presetIds: ['canonical'],
      parameterDomain: { rho: [28, 28], sigma: [10, 10] },
      note: 'Classical parameter point; beta is fixed at 8/3 by the kernel contract.',
    },
  ],
  primaryClaims: [
    {
      id: 'canonical-two-lobe-recurrence',
      appliesToRegimeIds: ['canonical-rho-28'],
      statement:
        'A finite post-burn-in trajectory repeatedly visits two lobes within a bounded dissipative regime.',
      objectKind: 'orbit-segment',
      observableIds: ['x', 'z'],
      limitations: ['Finite-time x-z projection; the polyline is not an exact attractor.'],
      targetMaturity: 'M3',
    },
  ],
  science: {
    representation: 'governing-law-execution',
    capabilities: ['local-stability', 'recurrence', 'empirical-measure'],
    validations: [
      'short-time-step-halving',
      'equilibrium-residual',
      'long-time-statistic-reference',
    ],
  },
  visualMappings: [
    {
      id: 'lorenz-orbit',
      objectId: 'post-burn-in-orbit',
      appliesToRegimeIds: ['canonical-rho-28'],
      mark: 'path',
      bindings: [
        {
          quantityRef: 'x',
          channel: 'position-x',
          scale: 'linear',
          domain: [-24, 24],
          outOfDomain: 'overflow-indicator',
        },
        {
          quantityRef: 'z',
          channel: 'position-y',
          scale: 'linear',
          domain: [0, 50],
          outOfDomain: 'overflow-indicator',
        },
      ],
      scientificTime: {
        quantityRef: 'simulation-time',
        mode: 'cursor',
        interpolation: 'linear',
      },
      reducedMotion: {
        strategy: 'accumulated-density',
        dataRef: 'post-burn-in-occupancy',
        preserves: ['two-lobe support', 'fixed x-z projection'],
      },
      displayConstraints: {
        viewport: {
          policy: 'fit-declared-domain',
          minimumVisibleFraction: 1,
          preserveAspect: true,
        },
        style: {
          minimumContrast: 4.5,
          strokeWidthRange: [0.75, 2],
          maximumGlowRadius: 8,
        },
      },
      projection: {
        coordinateRefs: ['x', 'z'],
        method: 'selected-coordinates',
        aspect: 'equal-data-units',
      },
    },
  ],
} satisfies Partial<WorkManifestV2>;
```

現行の個別runごとのmin/max fitは、形を美しく埋める一方でparameter間比較を歪める。固定またはmanifest宣言domainを使い、range外は数値runをinvalidにせずoverflow indicatorまたは明示的out-of-frameとして扱う。non-finiteやsolver constraint違反だけがnumerical invalidである。

### 7.8 schema運用

- JSON Schemaは実際に Draft validator（例: Ajv）へ通し、required fieldを手書きで一部確認するだけにしない。
- built-in TypeScript catalogもbuild時に同じschemaへ変換・検証する。
- runtime registryは kernelごとに許される formal class、parameter、solver profile、output payloadを照合する。
- analyzerは capabilityごとに登録し、出せないobjectを空配列や推測で埋めない。
- v1作品はadapterで読めるようにし、30作品を一括rewriteしない。M0 surrogate labelとprimary claimから順に移行する。

---

## 8. 既存作品への適用例

> **Historical baseline:** current image / maturity列は監査commit 1412542に対する評価であり、
> 現在のsolver-backed collectionの分類ではない。現在のfield実装は§10 Phase 4を参照。

### 8.1 比較要約

| 作品               | Formal mathematical class                                                                                        | Primary dynamical object / truth                                            | 最適なprimary image                              | 現行 maturity                        | 目標 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------ | ---- |
| Lorenz             | R³上のautonomous smooth dissipative flow                                                                         | burn-in後の有限orbit segmentと二葉へのrecurrence                            | 固定x–z projectionの細い軌跡 + empirical support | governing-equation、M0               | M3   |
| Fed Reaction Chain | R³₊上のperiodically forced nonautonomous linear compartment ODE / process。forcing phase追加でautonomous cocycle | transient後の周期応答、throughput、phase lag                                | vessel量 + directional flux channel              | governing-equation、M0               | M3   |
| Kuramoto           | 12-torus上のfinite network ODE                                                                                   | instantaneous coherence。frequency lockingは別の検証対象                    | phase circle + order vector                      | governing-equation、M0               | M3   |
| FPUT               | 16次元phase spaceのfixed-boundary α-FPUT Hamiltonian ODE                                                         | harmonic normal-mode間energy transferとrecurrence                           | harmonic modal-energy ribbons + exact-H residual | governing-equation、M0。主張も未検証 | M3   |
| Gray–Scott         | 2成分reaction–diffusion PDEが生成するsemiflow                                                                    | concentration fieldのspot / stripe dynamics、interface / coherent structure | actual v-field frames + contour                  | M0 illustrative surrogate            | M3   |

### 8.2 Lorenz Atmosphere

- **formal class:** σ、ρ、βをparameterとするautonomous smooth ODE flow on R³。標準regimeはdissipative。Lorenzの原論文は [Lorenz, 1963](https://doi.org/10.1175/1520-0469%281963%29020%3C0130%3ADNF%3E2.0.CO%3B2)、古典parameterでのLorenz attractorの存在に関するcomputer-assisted proofは [Tucker, 1999](https://doi.org/10.1016/S0764-4442%2899%2980439-X)。
- **主たるobject:** まず “post-burn-in finite orbit segment in the x–z projection”。十分な別証拠があるpresetだけ “chaotic attracting regime” とする。
- **global structure:** canonical ρ=28、σ=10、β=8/3では三つのequilibria、二葉のrecurrent support、葉間遷移、外部からのtransientを対象にする。ρ≤1ではnonzero equilibriaが存在せず、他regimeではstabilityも変わるため、このclaimをwork全parameterへ拡張しない。Conley / Morse approximationは低次元なのでofflineまたはworker解析候補だが必須ではない。
- **local / statistical / spectral annotations:** equilibria residualとJacobian eigenvalues、finite-time separation、lobe residence / return time、empirical occupancy。Koopman / DMDはobservableとresidualを開示する補助表示に留める。
- **primary image:** 現行の蝶形細線を維持し、x–zの固定projection、burn-in区間とdisplay区間を分ける。active pointと細いtrace stripも維持する。
- **secondary evidence:** Studyでequations、parameters、projection、short-time step-halving、boundedness / divergence、lobe transition statistics、sourceを示す。
- **変更:** runごとの独立min/max normalizationを固定scaleへ。有限polylineを “attractor” と断定しない。failureをclampしない。
- **数値検証:** chaosでは終点一致を長時間convergence基準にしない。短時間trajectory convergence、equilibrium residual、長時間のbounded statistics / symmetry / return distributionを組み合わせる。現行既定値のRK4を独立にstep-halvingすると短時間差は小さいが、t≈20以後のendpoint差はO(1)へ成長するため、これは失敗ではなく検証対象の選び方の問題である。
- **science maturity:** 現行はgoverning-equation solverだが、silent clampとvalidation欠如のためM0。M3へはM1のfailure semantics、M2のconvergence、reference statisticが必要。

### 8.3 Fed Reaction Chain

- **formal class:** 正のorthant上のperiodically forced nonautonomous linear compartment ODE。forcingのphaseをS¹ stateとして追加すればautonomous skew-product / cocycleとして扱える。
- **主たるobject:** 安定なthroughput chainがforcingに遅れて応答し、transient後にperiodic responseへ近づくこと。
- **global structure:** positivity-preserving compartment flow、単一 attracting periodic response候補、input→A→B→C→outflowのdirectional balance。
- **local / statistical / spectral annotations:** homogeneous linear partのeigen-timescales、forcing frequencyに対するgain / phase lag、各compartmentのperiod average、mass-balance residual。
- **primary image:** generic A–B phase polylineではなく、旧DynaMusiumのvesselsとchannelsをmuseum shell内へ再接続する。quantity=fill、instantaneous rate=width / emission frequency、time-integrated rate=cumulative particle count、direction=chevron / laneを保つ。
- **secondary evidence:** StudyでA、B、C、input、各flux、cumulative input / output、balance residual、periodic steady-state distanceを同一runから表示。
- **維持:** deep-ink room、静かな発光、左caption / 右phenomenon、trace strip、旧networkの科学的encoding。
- **変更:** 現行kernelは一個の rate から0.72、0.48を掛け、feed period 18をhard-codeしている ([simulation.ts](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/simulation.ts#L78-L91))。表示 / manifestのk₁,k₂,k₃、forcing periodと一致させる。Michaelis–Mentenをこの一次compartment chainの直接出典にはしない。
- **数値検証:** positivity、period balance、step-halving、解析的matrix-exponential / forced steady-stateとのreference比較。現行既定値のstep-halving終点差は約6.9×10⁻⁹で小さいが、silent clampを残したままのpassとはしない。
- **science maturity:** 現行はgoverning-equation solver、M0。旧typed solverのinvalid-result / positivity / reservoir checksを統合し、convergenceとreference比較でM3。

### 8.4 Kuramoto Oscillators

- **formal class:** phase vector θ∈T¹² 上のautonomous deterministic network ODE。自然周波数は現行では等間隔の決定論的列であり、spread parameterは標準偏差ではない。原型は [Kuramoto, 1975](https://doi.org/10.1007/BFb0013365)。
- **主たるobject:** order parameter z = N⁻¹Σ exp(iθⱼ) の大きさrが表す有限Nのinstantaneous coherence。frequency lockingはrだけでは言えず、各oscillatorの長時間mean frequency residualで別に検証する。r≈0ではψは不安定 / 実質未定義なので表示しない。
- **global structure:** torus上のphase population、global phase symmetry、couplingに応じたincoherentからcoherentへのregime変化。有限Nの一runから熱力学極限のcritical couplingを主張しない。
- **local / statistical / spectral annotations:** r(t)、phase histogram、各oscillatorのmean frequency、locked cluster、finite-time fluctuations。parameter sweepを行うならhysteresis、finite-size uncertainty、initial ensembleを出す。
- **primary image:** unit circle上の12 phase pointsとorder vector。rが宣言threshold未満ならvectorのangleを意味あるψとして強調しない。現行の細線、violet / cyan、single focal pointの静けさを保ち、3D化しない。
- **secondary evidence:** Studyでr(t)、ψ(t)、natural vs observed mean frequency、N、frequency construction、initial phases、step refinement。
- **変更:** generic collective-x vs collective-y polylineだけでは同期の因果が読めない。circleをprimary、order-parameter traceをsecondaryにする。“spread”の意味をrange scale等へ正確にrenameするか、真の分布standard deviationを実装する。
- **数値検証:** phase shift symmetry、r∈[0,1]、coupling zeroの解析解、permutation invariance、step-halving、locked frequency residual。現行既定値のstep-halving差はmachine precision級だが、検証suiteとして固定する必要がある。
- **science maturity:** 現行はgoverning-equation solver、M0。failure semanticsと検証追加でM3。

### 8.5 FPUT Chain

- **formal class:** fixed endpointsをもつ8 particle α-FPUT chain。qとpからなる16次元Hamiltonian ODE。歴史的原典は [Fermi–Pasta–Ulam–Tsingou report, LA-1940](https://doi.org/10.2172/4376203)。
- **主たるobject:** 最初のnormal modeに置かれたenergyが他modeへ移り、equipartitionへ単調に進まず再帰すること。
- **global structure:** energy level set上のHamiltonian flow、mode coupling、near-integrable recurrence。一般的なattractor描画は不適切。
- **local / statistical / spectral annotations:** modal coordinates Qₖ、quadratic / harmonic modal energies Eₖ^(2)、exact nonlinear Hamiltonian H、interaction contribution H−ΣEₖ^(2)、spectral entropy、recurrence time / distance。
- **primary image:** harmonic modal energiesを細いribbonsで示し、signed nonlinear interaction contributionを別channelにする。ΣEₖ^(2)はα≠0でexact total energyではないため、“total-energy partition”とは呼ばない。全8modeを同時に騒がしく出さず、primary modeと“others”を主像、詳細をStudyへ。
- **secondary evidence:** qᵢ(t)、Eₖ^(2)(t)、exact H、H−ΣEₖ^(2)、Hamiltonian residual、recurrence criterion、solver / step。
- **維持:** 静かなrhythm、細いtrace、long dwell。
- **変更:** 現行solverは実際のα-FPUT equationを積分するが、返すのはmass 1,3,5,7のdisplacementである ([simulation.ts](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/simulation.ts#L150-L179))。これでは作品の中心であるmodal-energy recurrenceを検証・表示していない。duration 40の既定runでも第一modeのharmonic energy比は末尾で約0.944で、明確なrecurrenceを示す窓とは言えない。
- **数値検証:** 正確なHamiltonian drift、symplectic time-reversal / long-time behavior、step refinement、linear α=0 reference、recurrence distance。長時間展示にはgeneric RK4よりsymplectic integratorを第一候補とする。
- **science maturity:** governing-equation solverだがruntime safetyとprimary evidenceが未検証のM0。modal observableとconservation testでM3へ。

### 8.6 Gray–Scott Pattern

- **formal class:** 2成分reaction–diffusion PDEが適切なboundary conditionの下で生成するsemiflow。支配式、Dᵤ、Dᵥ、feed、kill、domain、boundary、initial perturbationを全てcontractに含める。pattern regimeの古典的研究は [Pearson, 1993](https://doi.org/10.1126/science.261.5118.189)。
- **主たるobject:** v concentration fieldで起きるspot replication、stripe、interface evolution等、選んだpresetの一つの現象。
- **global structure:** function space上のattracting regimeという理論的背景はあるが、ブラウザの一runからglobal attractor全体を描いたとは言わない。field snapshots、coherent structures、empirical statisticsを対象とする。
- **local / statistical / spectral annotations:** u / v、reaction / diffusion terms、mass-like statistics（保存量ではない）、spot count、interface length、spatial spectrum、grid / time convergence。
- **primary image:** actual v(x,y,t) framesと、必要なら計算されたinterface contour。physical coordinatesをsemanticに使うため、現行の楕円状nonuniform stretchは避けるか、decorative frameをfield外に置く。
- **secondary evidence:** boundary / initial conditions、Dᵤ/Dᵥ、Δt、Δx、CFL / stability condition、u/v range、residual、coarse/fine grid比較、reference morphology。
- **維持:** 現行の抑制されたpalette、暗いroom、余白、長時間見られる低速staging。模様自体はsolver frameへ置換し、ambient glowは別layerに残す。
- **変更:** 現行は固定phase=1.7のradial sine/cosine textureで、feed / killを位相へ入れているだけである ([simulation.ts](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/simulation.ts#L548-L559))。time integration、u field、Laplacian、diffusion、reaction step、boundaryがない。正確な分類は **illustrative surrogate, M0**。
- **数値検証:** manufactured / reference solutionが難しければ、constant steady states、nonnegativity / admissible range policy、step-halving、grid refinement、reaction-only limit、diffusion-only smoothing、known Pearson regimeの統計を組み合わせる。
- **science maturity:** 現行M0。actual solver + convergenceでM2。独立reference solution / statisticまたはpublished regime benchmarkとの照合でM3とし、self-regression単独はM3としない。

### 8.7 他field作品の正確な現行分類

| 作品           | 現行コードが計算するもの                                  | 支配方程式を時間発展しているか                         | 現行表示ラベル                          | 昇格に必要なruntime                                                                                                    |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Gray–Scott     | radial sin/cos texture                                    | いいえ                                                 | illustrative surrogate, M0              | 2-field reaction–diffusion solver                                                                                      |
| Cahn–Hilliard  | sin/cos texture + coordinate hash + tanh                  | いいえ                                                 | illustrative surrogate, M0              | periodic / no-flux等のboundaryを指定したfourth-order PDEまたはsplit / spectral solverとmass balance                    |
| Ising          | coordinate hashをtemperature / field閾値で二値化しblock化 | いいえ。Monte Carlo Markov chainでも平衡sampleでもない | illustrative surrogate, M0              | kinetic timeならGlauber / Kawasaki等、平衡sampleならMetropolis / Wolff等を区別し、seed、burn-in、autocorrelationを記録 |
| Shallow-water  | 二つのstatic sine waves                                   | いいえ                                                 | illustrative surrogate, M0              | 選んだ方程式・forcing・boundaryに対応するfinite-volume等、CFL、discrete mass / energy / PV等のbalance                  |
| Wave           | 固定phaseのsin / cos texture                              | PDE time evolutionではない                             | formula-generated surrogate, M0         | closed-form modeと正確に再定義するかwave solver                                                                        |
| Heat           | source Gaussianのstatic sum                               | いいえ                                                 | illustrative surrogate, M0              | diffusion solver / valid closed form                                                                                   |
| Schrödinger    | Gaussian envelope × cosine                                | いいえ                                                 | illustrative surrogate, M0              | complex wavefunction solver / exact packet contract                                                                    |
| Budyko–Sellers | latitudeのstatic logistic formula                         | time-dependent EBMではない                             | formula-generated reduced surrogate, M0 | 0D/1D EBM relaxation solverまたはequilibrium lawを明記                                                                 |

特に Cahn–Hilliard は指定boundary下のmass balance、Ising はkinetic lawまたはequilibrium distribution、shallow-water は選んだequations / boundary / forcingに応じたdiscrete balancesが主要な科学的真実になり得る。現在の模様はそのどれも計算していないため、見た目を維持しても solver と称してはならない。

ここで参照した基礎資料は [Cahn–Hilliard, 1958](https://doi.org/10.1063/1.1744102)、[Ising, 1925](https://doi.org/10.1007/BF02980577)、shallow-waterを含むgeophysical fluid dynamicsの標準的定式化として [Vallis](https://doi.org/10.1017/9781107588417) である。これらの引用が、現行synthetic fieldを支配方程式のsolutionへ昇格させるわけではない。

---

## 9. 現行GitHub実装の科学的監査

> **Historical baseline:** この監査matrix、severity、test結果はcommit 1412542を固定対象とする。
> 修正後の安全境界は [numerical-method.md](./numerical-method.md) と§10を参照。

### 9.1 severity

- **P0 — scientific truthfulness blocker:** 現在の表示が計算した科学対象を偽って見せる、またはfailureをvalid dataへ変換する。一般化より先に修正。
- **P1 — validated-runtime blocker:** equation、solver、表示、provenanceの一致や再現性を保証できない。v2 flagship公開前に修正。
- **P2 — contract / experience debt:** 直ちに数値を偽らないが、contribution、accessibility、保守性、展示意味を弱める。

### 9.2 全30作品のequation–execution–display truth matrix

これは全作品についてactive code pathを追った静的分類である。文献中の全係数を独立再導出したという意味ではなく、支配lawを実行しているか、何を出力しているか、明白なclaim gapは何かを全30作品で確認した。5 flagshipは§8でさらに深く評価した。

| Work                        | declared runtime / render | effective computation                                | 現行representation / maturity                 | 主なcurrent gap                                                                               |
| --------------------------- | ------------------------- | ---------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Double Pendulum             | ode / orbit               | 4-state fixed-step RK4、tip x–yを出力                | governing-equation solver / M0                | energy residual、step refinementなし。nearby-trajectory separationというclaimに対し一軌跡だけ |
| Kuramoto Oscillators        | ode / orbit               | 12-phase RK4、order parameterだけを出力              | governing-equation solver / M0                | phase populationを捨てる。“spread”は標準偏差でなく、locking未検証                             |
| FPUT Chain                  | ode / series              | 8 q + 8 pのα-FPUT RK4、奇数mass変位だけ出力          | governing-equation solver / M0                | modal energy / recurrenceを表示せず、exact H検証なし                                          |
| Logistic Map                | discrete / series         | logistic recurrenceを80-step burn-in後に720点        | governing map evaluator / M0                  | parameter-regime claim、invariant measure、finite precision / orbit checksなし                |
| Wave Equation               | field / field             | fixed-phase sin / cos texture一枚                    | formula-generated surrogate / M0              | PDE time evolution、initial / boundary、wave speed relationなし。偽timeあり                   |
| Standard Map                | discrete / phase          | torus上のstandard-map型iteration 851点               | governing map evaluator / M0                  | symplectic / area preservation、regime / rotation number、precision検証なし                   |
| Fed Reaction Chain          | reaction-network / series | 別実装の3-state forced RK4                           | governing-equation solver / M0                | 旧typed runtimeを使わず、hidden period 18、rate ratios、citation / display不一致              |
| Gray–Scott Pattern          | field / field             | radial sin / cos texture一枚                         | illustrative surrogate / M0                   | reaction–diffusion PDEを解かず、u / diffusion / boundary / timeなし                           |
| Heat / Diffusion            | field / field             | static Gaussian blob sum                             | illustrative surrogate / M0                   | heat equation、initial condition、time decayなし。偽timeあり                                  |
| Schrödinger Wave Packet     | field / field             | Gaussian envelope × cosine texture                   | illustrative surrogate / M0                   | complex ψ、unitary evolution、normalization、boundaryなし                                     |
| Ising Model                 | discrete / field          | coordinate hash threshold + block scaling            | illustrative surrogate / M0                   | spin Markov chainでもGibbs sampleでもなく、seed / equilibrationなし                           |
| Cahn–Hilliard Separation    | field / field             | sin / cos + hash + tanh texture                      | illustrative surrogate / M0                   | fourth-order PDE、mass balance、boundary、coarsening timeなし                                 |
| Lotka–Volterra              | ode / phase               | standard 2-state RK4                                 | governing-equation solver / M0                | positivity、first integral / closed-orbit reference、step checksなし                          |
| Brusselator                 | ode / phase               | standard 2-state RK4                                 | governing-equation solver / M0                | positivity、Hopf regime、reference cycle / convergenceなし                                    |
| Oregonator                  | ode / phase               | simplified 3-state RK4                               | reduced governing-equation solver / M0        | q=0.02とz timescale=0.3をhard-code。positivity / stiffness / source-form照合なし              |
| SIR Epidemic                | ode / series              | S,I,Rの3-state RK4                                   | governing-equation solver / M0                | S+I+R=1、positivity、threshold / final-size relation未検証                                    |
| Hodgkin–Huxley Neuron       | ode / series              | V,m,h,nのRK4                                         | governing-equation solver / M0                | αn removable singularity limitが0.1でなく1、gating bounds / stiffness未検証                   |
| FitzHugh–Nagumo             | ode / phase               | 2-state RK4                                          | governing-equation solver / M0                | regime / nullcline / reference cycle、step checksなし                                         |
| Lorenz Atmosphere           | ode / phase               | 3-state RK4、x–z projection                          | governing-equation solver / M0                | silent clamp、regime-scope / burn-in / short-vs-long validationなし                           |
| Stommel Ocean Box           | ode / phase               | 2-state reduced box ODE RK4                          | reduced governing-equation solver / M0        | bifurcation / basin evidence、units、parameter provenanceなし                                 |
| Daisyworld                  | ode / series              | 2-population reduced ODE RK4                         | reduced governing-equation solver / M0        | hard maxでbare / growthを処理、simplex invariance / climate referenceなし                     |
| Three-Box Carbon Cycle      | ode / series              | 3-box linear ODE + early emission pulse              | reduced governing-equation solver / M0        | pulse duration=22%をhidden hard-code、carbon budget / units未検証                             |
| Shallow-Water Waves         | field / field             | two static sine waves                                | illustrative surrogate / M0                   | mass / momentum equations、CFL、boundary、discrete balancesなし                               |
| Budyko–Sellers Climate      | field / field             | latitude formula + logistic一枚                      | formula-generated reduced surrogate / M0      | time-dependent EBM / equilibrium solveでなく、ice-line memory claim未検証                     |
| Restricted Three-Body       | ode / orbit               | rotating-frame 4-state RK4                           | modified governing-equation solver / M0       | r≥0.03 floorでclose encounter physicsを無注記変更、Jacobi residualなし                        |
| Kepler Orbit                | analytic / orbit          | exact conic shapeをuniform true anomalyでsample      | spatial closed-form + incorrect time law / M0 | equal areas / unequal speedsという作品claimを満たさない                                       |
| Hohmann Transfer            | analytic / orbit          | piecewise radial formula                             | formula-generated surrogate / M0              | transfer arcがtargetへ連続着地せず半周でjump、burn / timing未計算                             |
| N-Body System               | ode / orbit               | 3-body 12-state RK4                                  | modified governing-equation solver / M0       | r≥0.12 floor、energy / momentum / center-of-mass residualなし                                 |
| Friedmann–Lemaître Universe | ode / series              | expanding-branch 1-state RK4                         | modified governing-equation solver / M0       | radicand / a floorがturnaround / forbidden regimeを隠す                                       |
| Exoplanet Transit           | analytic / series         | heuristic overlap + limb-darkening-like flux formula | formula-generated reduced surrogate / M0      | exact disk-overlap / limb-darkening integralでなく、units / reference light curveなし         |

全30作品がM0なのは「全てが同程度に間違い」という意味ではない。governing lawを実行する作品とsurrogateはrepresentation軸で明確に異なる。一方、現行共通runtimeがsilent clamp、failure surface、provenance、claim-specific validationのM1 gateを満たさないため、maturityだけは一律M0となる。

### 9.3 重大 findings

| Severity | finding                                            | コード上の証拠                                                                                                                                                                                                                                                                                                                                                      | 科学的影響                                                                 | 必要な是正                                                                                               |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **P0**   | field作品は時間発展solverではない                  | [fieldWork](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/simulation.ts#L509-L604) は48×32の一枚を固定phase 1.7で数式合成。Gray–ScottにLaplacianもtime loopもu fieldもない                                                                                                                                          | PDE / Markov modelを解いたように見える                                     | 直ちにsurrogate label。実solver導入までequation-solution claimを外す                                     |
| **P0**   | 空間rowをtimeとして表示                            | 行平均32個を [0,duration]へmapし、“Field intensity / Local contrast” seriesにする ([simulation.ts](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/simulation.ts#L606-L633))。Studyはそのindexを t と表示する                                                                                                         | 緯度 / y方向の変化が時間変化として誤読される                               | surrogateではtime control / traceを外し、actual field runtimeはtimes + framesを返す                      |
| **P0**   | non-finiteと発散をsilent fallback / clamp          | finite は非有限値をfallback 0へ、有限値を±1e6へ切る ([simulation.ts](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/simulation.ts#L16-L18))。全RK4 step、series、points、fieldへ適用                                                                                                                                 | divergence、overflow、bad derivativeが滑らかな有限作品になる               | valid / invalid union、first failure time、state、diagnosticを返し再生停止                               |
| **P0**   | state / derivative次元不一致を0で埋める            | RK4 stageはmissing k[i]を0、series / point化はmissing state[i]を0とする ([simulation.ts](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/simulation.ts#L30-L41))                                                                                                                                                      | kernelの配列長bugが別のODE / geometryとして静かに継続する                  | 各derivative stageで次元・finiteを検査し、mismatchはtyped failure                                        |
| **P0**   | worker failure時に旧resultを保持                   | error pathはsetErrorだけでsetResultを無効化しない ([useWorkSimulation](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/useWorkSimulation.ts#L24-L36))                                                                                                                                                                 | 新parameter UIと旧trajectoryが同じ作品として並ぶ                           | current request resultをinvalid化。残すなら “last valid” と明示・操作分離                                |
| **P1**   | runtime宣言がdispatchを拘束しない                  | simulateWorkは work.runtimeを参照せずkernel名を各handlerへ順番に試す                                                                                                                                                                                                                                                                                                | manifest、solver、output kindの不一致を型で防げない                        | typed runtime registry、kernel capability / output validation                                            |
| **P1**   | 一つの固定刻みRK4 policyをほぼ全ODEへ適用          | generic RK4は既定720 steps、作品ごとに一部stepsだけ変更 ([simulation.ts](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/simulation.ts#L20-L47))                                                                                                                                                                      | stiffness、Hamiltonian長時間誤差、close encounter、fast gatingを評価しない | solver profileを作品別にする。adaptive error control / symplectic / event / stiff solverを必要に応じ選択 |
| **P1**   | model-specific validationがない                    | catalog testはfiniteな配列等を検査するが、finite関数が先にsanitize。step-halving、invariant、reference statistic、positivity、conservationのmuseum作品testがない                                                                                                                                                                                                    | “test pass” が科学的妥当性を示さない                                       | primary claimごとのvalidation requirementsとregression artifacts                                         |
| **P1**   | numerical resultが描画geometryを返す               | WorkResult.pointsをkernelが直接構成し、rendererが全作品で同じ2D polylineへfit                                                                                                                                                                                                                                                                                       | projection / axes / units / meaningが消え、renderer taxonomyが名目化       | raw result → object → visual mappingへ。pointsを廃止                                                     |
| **P1**   | equation / solver / claimの個別不一致              | FPUTはmass displacementしか返さない、Keplerはtrue anomalyを時間に一様増加、Fedはhidden rate ratios、Hohmann式はtransfer endpointと整合しない。Friedmannはradicandとaをfloorしてturnaround / forbidden regimeを隠し常にexpanding branchへ進める                                                                                                                      | source equationやcaptionの主要命題を表示が裏づけない                       | 作品別 science review。definition hash、observable contract、reference checks                            |
| **P1**   | singularityを無注記でphysics変更                   | restricted three-bodyはr≥0.03、N-bodyはr≥0.12へhard floor ([simulation.ts](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/simulation.ts#L329-L375))                                                                                                                                                                  | close encounterのforceとinvariantsを別モデルへ変える                       | explicit softening model / collision event / invalid domainとしてmanifestに記述                          |
| **P1**   | Hodgkin–Huxley removable singularity処理に誤り     | safeRateは分母≈0で両方1を返す。αₘのlimitは1だがαₙのlimitは0.1 ([simulation.ts](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/simulation.ts#L243-L263))                                                                                                                                                              | v≈−55でK activation rateが10倍                                             | 各rateのexprel / analytic limitを個別実装しreference test                                                |
| **P1**   | stochastic seed contractがない                     | Isingのseeded関数は座標hashでありtrajectory PRNGではない。manifest / WorkResultにseed、algorithm、ensembleがない                                                                                                                                                                                                                                                    | stochastic processの再現・監査・uncertainty分離が不能                      | algorithm + seed + sample scheduleをprovenanceに必須化                                                   |
| **P2**   | JSON Schemaを実際には使っていない                  | validator scriptは一部required fieldと形式を手書き検査するだけ ([validate-works](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/scripts/validate-works.mjs#L1-L43))                                                                                                                                                             | schemaと実際のcontribution gateがdrift                                     | built-in / communityを同じDraft validatorへ                                                              |
| **P2**   | museum reduced-motionがanimationを止めない         | CSSはcard transitionを止めるだけ ([museum.css](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/museum/museum.css#L1123-L1130))。rAF progress、active point、cursorは継続                                                                                                                                                     | motion sensitivityに対する現行museumの意味保存が不十分                     | motion channelをstatic density / phase marks / small multiplesへ置換                                     |
| **P2**   | 旧solverのmonotonicity tolerance定義と使用が不一致 | MONOTONICITY_TOLERANCE=1e−12があるがreservoir checkはNONNEGATIVE_TOLERANCE=1e−9を使う ([tolerance](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/solver/numerical-tolerance.ts#L1-L13); [integrate](https://github.com/yktsnd/dynamusium/blob/1412542b3cce85b3aef8c6e77e977c9f853d3660/src/solver/integrate.ts#L116-L130)) | 文書化されたinvariant thresholdと実検査が違う                              | canonical toleranceを一つ選びtest名と合わせる                                                            |

### 9.4 ユーザー指定監査項目への直接回答

| 監査項目                              | 判定                                | 根拠 / コメント                                                                             |
| ------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| 非有限値をsilent fallbackしていないか | **している — P0**                   | non-finite→0、fieldでは0.5                                                                  |
| 数値を任意にclampしていないか         | **している — P0**                   | generic ±1e6、field [0,1]。後者も物理範囲の検証ではない                                     |
| 発散やsolver failureを隠していないか  | **隠し得る — P0**                   | stepごとのsanitizeによりfailureが発生しない。worker failure時も旧像が残る                   |
| 固定刻みRK4が各モデルに妥当か         | **一律には妥当でない — P1**         | stiff gating、Hamiltonian長時間、singular gravity、将来PDE / hybridに同じpolicyは不可       |
| stiff systemへの配慮                  | **ない — P1**                       | stiffness indicator、adaptive / implicit solver、step rejectionなし                         |
| positivity                            | **museum runtimeでは保証なし — P1** | negative valueも±1e6範囲なら通る。旧reaction solverのみabort / tiny correctionあり          |
| conservation                          | **museum作品では検査なし — P1**     | FPUT / N-body / shallow-water等にresidualなし                                               |
| step-halving convergence              | **suiteにない — P1**                | 独立spot checkは下記。作品contractとして固定されていない                                    |
| invariant residual                    | **ない — P1**                       | equilibrium、Hamiltonian、mass、order bounds等がdiagnostic化されていない                    |
| reference trajectory / statistic      | **museum作品にはない — P1**         | source URLはあるがcomputed reference artifactはない                                         |
| random processのseedと再現性          | **contractなし — P1**               | Isingはrandom processを実装せず、座標hashのみ                                               |
| equation、solver、表示が一致          | **複数不一致 — P1**                 | field全般、FPUT observable、Kepler time law、Fed rates、Hohmann、Friedmann floors、HH limit |
| fieldの行や列を時間として誤表示       | **している — P0**                   | rowMeans indexをdurationへ線形map                                                           |

### 9.5 固定RK4のspot checkと解釈

現行commitのcatalog default、kernel initial condition、durationを固定し、silent finite clampを外した同じ式をfloat64 RK4で再計算した一回限りのexploratory probeである。coarse / fineはFed 720/1440、Kuramoto 720/1440、FPUT 1000/2000、Lorenz 1400/2800 steps。Fed / FPUTはfull state終点の∞-norm、Kuramotoはorder vectorだけの終点∞-norm、Lorenzは共通時刻のfull state∞-normを比較した。FPUT driftはcoarse trajectory上のexact nonlinear Hamiltonianに対するmax relative driftである。

| 作品               |            現行 dt |                                                             step-halving差 | 解釈                                                                              |
| ------------------ | -----------------: | -------------------------------------------------------------------------: | --------------------------------------------------------------------------------- |
| Fed Reaction Chain |  60 / 720 ≈ 0.0833 |                                              final state max差 ≈ 6.85×10⁻⁹ | このpresetの終点observableでは小さい。positivity / balance / semanticsは未検証    |
| Kuramoto           |  24 / 720 ≈ 0.0333 |                                       order variables final差 ≈ 3.15×10⁻¹⁵ | order vectorだけでは小さい。full phases、wrapping、lockingは未検証                |
| FPUT               |   40 / 1000 = 0.04 | full state final max差 ≈ 2.08×10⁻⁸、max relative energy drift ≈ 1.91×10⁻¹⁰ | 短い既定窓の指標に限る。recurrenceの長時間展示にはsymplectic比較が必要            |
| Lorenz             | 38 / 1400 ≈ 0.0271 |                          t≈5: 0.0295、t≈10: 0.1165、t≈20: 5.13、t≈38: 4.97 | chaosでendpoint convergenceが崩れるのは予想される。短時間誤差と長時間統計を分ける |

このprobeは保存済みaudit artifactでも現行test suiteの一部でもなく、release acceptance evidenceには使わない。また、silent clampを通る経路を正当化しない。各作品のmigration phaseで同じ計算をversioned test / fixtureとして保存し、execution methodの妥当性をprimary claimに応じて評価する。

### 9.6 現行test / buildの実行結果

- TypeScript typecheck: pass
- Vitest: 10 files、63 tests pass
- ESLint: pass
- Vite production build: pass
- Prettier check: Windows checkoutがcore.autocrlf=trueで全117 fileをCRLF警告。worktreeはcleanだったため、この監査ではsource defectと判定しない
- Playwright: 9 testsはChromium executable未installの環境setupで起動前に失敗。製品assertion failureではない
- 代替のlive inspection: local production/dev appをin-app browserで開き、入口、Lorenz Observe / Study / Exhibit、Gray–Scottを操作。Gray–Scottはslider時刻0.447→0.496でCanvas data URLが同一だった

単体testが通る事実と、科学監査が通る事実は別である。現行testは旧reaction runtimeのnumerical safetyをよく守る一方、museum runtimeのsanitizeされた出力に対する有限性検査が中心である。

### 9.7 修正順序

1. fieldのsurrogate明示、偽time / trace停止
2. finite clamp廃止、valid / invalid result、stale result隔離
3. runtime registryとfull schema validation
4. HH / Kepler / Hohmann / gravity softening / Fed metadata等の作品別truth audit
5. flagshipのsolver / observable / validation contract
6. advanced portrait capability

Conley、Koopman、Morse graphを実装する前に1–4を完了する。高度な解析が、間違ったraw resultを科学的に見せる装飾になってはならない。

---

## 10. Historical baseline roadmap と現在の disposition

このroadmapは 1412542 の監査から作った移行順序であり、現在の機能一覧ではない。実装では
画面の全面刷新をせず、各phaseの科学的exit gateを小さなruntime / contract testへ変換した。

### Phase 0 — Truthfulness patch: Implemented

- silent non-finite / magnitude clampと欠落derivativeのzero fallbackを廃止した。
- invalid runはdisplay payloadを持たず、loading時に旧resultを外し、stale worker responseを無視する。
- fieldのrow / columnをtime seriesへ偽装するpathを廃止し、actual sample times + framesを返す。
- HHのremovable singularityは有限な極限式で扱う。

baseline案の「surrogateと明記して一時的に残す」は、安全な最小patchとしては妥当だったが、
現在は対象fieldを実solver、analytic family、または明示したreduced modelへ置換したため採用していない。

### Phase 1 — Contract spine: Implemented differently

- WorkManifest v2、formal class、representation、regime / claim、valid / invalid run、provenance、
  field frames、semantic mappings、compositionを実装した。
- built-in 30作品はすべてv2である。community v1 / v2は別々のstrict schemaで検証する。
- v1 adapterはreview済みbuilt-in kernelにだけ適用する。未知のv1 kernelからformal classやevidenceを
  推測しないため、「任意のv1を自動昇格」は実装していない。
- 同一解決入力をrun境界で二度実行し、complete `WorkResult` のexact replayをhard checkにする。

### Phase 2 — Lorenz + Fed: Implemented

- Lorenzはraw `x, y, z`、固定projection、short-window step-halving、equilibrium / recurrence evidenceを返す。
- Fedはamount、instantaneous flux、cumulative flux accumulatorをruntimeで計算する。rendererはfluxを
  再積分せず、manifestのevent quantum / accumulator bindingを消費する。
- compositionはapproved layer order、focus、余白、bounded camera、non-semantic atmosphereだけを持つ。

### Phase 3 — Kuramoto + FPUT: Implemented

- Kuramotoは12個のraw phase、order parameter、finite-window frequency spreadを返す。
- α-FPUTは8粒子のposition / momentumをvelocity Verletで進め、modal energies、Hamiltonian residual、
  finite recurrence evidenceを返す。
- lockingやrecurrenceはfinite-window evidenceであり、無限時間の同期・再帰定理とは呼ばない。

### Phase 4 — Field runtimes: Implemented differently

| Work family    | 実装した方法                                                                 | baseline案との差                                     |
| -------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| Gray–Scott     | periodic finite differences、explicit step、positivity / refinement evidence | 提案通り実fieldだが、有限grid / stability範囲に限定  |
| Cahn–Hilliard  | periodic finite differences、explicit conserved evolution                    | spectral / split solverではない                      |
| Ising          | explicit seed付きcheckerboard Metropolis sampler                             | sweepはphysical timeと呼ばない                       |
| Shallow-water  | linear rotating equations、periodic centered differences + RK4               | nonlinear finite-volume / shock solverではない       |
| Wave / Heat    | 宣言したmodal / finite Fourier analytic solution                             | generic PDE solverではない                           |
| Schrödinger    | free Gaussian wave packetのclosed formを有限display windowでsample           | complex fieldの全space normとwindow truncationを区別 |
| Budyko–Sellers | 1D zonal reduced EBM relaxation、no-flux meridional boundary                 | 2D climate fieldやfull GCMではない                   |

すべてactual frame time、grid / boundary / initial-condition provenanceを持つ。個々のcheckが
`passed`であることは、その有限discretizationについて宣言した残差を満たす意味であり、連続PDEの
一般解や収束証明を意味しない。

### Phase 5 — Advanced finite evidence foundation: Implemented within scope

**Live capability adapters**

- post-transient sampleのfinite recurrence rateとempirical occupancy
- 12×12 observed box-transition graphのstrongly connected componentsから作る有限artifact
- 二observableのexplicit identity dictionary、ridge EDMD、chronological 30% holdout、conditioning / residual
- 最終field frameのmean-level grid-edge sign-change density
- Cahn–Hilliard最終finite frameのlower-star H0 persistence check

これらはすべてcapability-gatedで、sample数、conditioning、residual等が不十分ならobjectを返さない。
box artifactはrigorous Conley enclosureではなく、EDMD objectはKoopman eigenfunction / complete spectrum
ではない。H0 pairはsupplied finite gridに対してexactだがcontinuum topologyではなく、interface estimateは
Morse–Smale complexでもtopology proofでもない。

**Bounded authoring / build-time API**

- finite-dimensional equilibrium residualに対するfinite-precision pseudo-arclength continuation。Newton residual、
  conditioning、step rejection、stability convergenceを保持し、tangent reversalはfold **candidate**として返す
- source / definitionを持つexplicit dictionaryのridge EDMD。training / chronological holdout、conditioning、
  finite operator / modes、principal-log branchを記録する
- supplied finite vertex filtrationのH0 lower-star persistence
- supplied finite transition relationのinvariant / recurrent / exit cells、finite Morse sets / order。sampled transition
  からisolationやConley indexを推論しない
- caller metadataがverified interval coverageを宣言し、finite isolationが成立し、別途external certificateが
  verified index pairを宣言した場合だけConley-index metadataを受理する。generic routine自身はenclosure、
  homology、certificateの正しさを証明しない。finite relation evidenceとcertificateはそれぞれsource refと
  lowercase SHA-256 content hashを必須とし、result provenanceへ保持する

**Generic browser foundationのcompletion scope外**

- existence / uniqueness / non-degeneracy / transversalityを保証したvalidated continuation branch
- true Koopman eigenfunction、complete / continuous Koopman spectrum、transfer-operator spectrum
- continuum persistent topology、H1 / H2、Morse–Smale complex、defect topology classification
- rigorous outer enclosureの生成、computer-assisted proof、独立検証済みConley index

これらを「未完の汎用renderer機能」とは扱わない。必要な作品だけがexternal artifactのsource、method、
enclosure / residual、certificate、independent reviewを追加して初めて主張できる。generic browser foundationの
完了は、それらの証明を自動生成することを意味しない。

### Phase 6 — Collection migration and contribution contract: Implemented

- permanent collection 30作品をv2 portraitへ移行し、作品ごとに一つのprimary claim、formal state、
  representation、reviewed regimes、validation requirements、semantic mappingsを登録した。
- v2 schema / validator / scaffolderと、科学review・composition / accessibility reviewの分離を実装した。
- attained maturityは実行時のreviewed regimeと実際のcheckからM0–M3で算出する。M4はtypeに予約するが、
  rigorous artifact reviewがない現在は自動付与しない。
- static、no-network、no-account、no analytics、no persistent storageのmuseum境界を維持する。

この disposition を「すべての高度解析を完成した」という意味には用いない。実装していない数学的
対象を空白のままにすることが、Dynamical Portrait contractの正常な挙動である。

---

## 11. 採用しない方針と理由

| 採用しない方針                                    | 理由                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 「全dynamicsの完全分類器」                        | equivalenceが一意でなく、一般分類不能性・決定不能性がある。科学的に過大                        |
| 独自の分類理論 / “scientific aesthetics compiler” | 研究上の新規主張になり、既存数学に根拠を置く目的から外れる                                     |
| 全作品を一個のcontinuous topological flow型へ強制 | random law、Markov distribution、nonautonomous forcing、hybrid jumpの意味を消す                |
| Conley theoryを全作品の必須出力にする             | 強力だがisolating region / enclosureが必要。高次元・fieldでbrowser計算を一律要求できない       |
| Conley indexをvisual shapeへ直接変換              | indexは存在 / continuationの証拠であり、形状textureではない                                    |
| Morse graphのedge幅をflux / probabilityへ使う     | edgeの意味はpartial order / connection evidenceで、量的flowではない                            |
| Koopmanを万能線形化compilerとする                 | observable依存、continuous spectrum、有限rank誤差があり、完全表現ではない                      |
| residualなしのDMDをKoopman modeと呼ぶ             | data fitとoperator eigenfunctionの主張を混同する                                               |
| finite histogramをinvariant measureと呼ぶ         | burn-in、stationarity、ergodicity、sampling errorが未確認                                      |
| modelが直接geometryを返す                         | scientific objectとprojection / visual semanticsを監査できず、現行points問題を固定化する       |
| equation / modelごとの専用rendererを増やす        | simulation集へ逆戻りする。小さなsemantic channel primitivesを共有すべき                        |
| 高次元系のdefault 3D化                            | projectionの科学的根拠がなく、occlusionとcamera演出が主役になる                                |
| decorative randomnessをuncertainty / chaosに使う  | scientific valueとatmosphereを混同する                                                         |
| 全作品へ同じ固定RK4                               | stiffness、Hamiltonian、event、PDE、stochastic lawに適合しない                                 |
| browser内で全作品の高解像度set-oriented解析       | curse of dimensionality。build-time artifact / reduced coordinates / optional capabilityが適切 |
| 現行UI・palette・typographyの全面刷新             | 問題は美術品質ではなく科学契約。完成したmuseum identityを壊す根拠がない                        |
| 30作品の一括migration                             | review不能な巨大差分になり、科学・runtime・visualの問題を混ぜる                                |

---

## 12. 最終的なDynaMusiumの定義

**DynaMusiumは、確立した数学の evolution semantics で記述された動的系を、再現可能な数値計算と出典付きの検証を通して、有限でスコープの明示された Dynamical Portraitへ変換し、その中の科学的対象を固定されたvisual channelで表現し、実装手段に依存しないcuration層が意味を変えずに静かな美術館的compositionへ編む、client-onlyのオープンな展示基盤である。**

それは方程式ごとのrenderer集ではない。また、全dynamicsを分類する新理論でもない。

訪問者に対する約束は次の三つに集約される。

1. **Observe:** 現象が主役であり、一作品のactive regimeにつき一つの科学的真実が静かに見える。
2. **Study:** 何を、どの式・条件・solver・observable・誤差・出典で見せているかを検証できる。
3. **Exhibit:** 科学的意味を変えず、UIを退かせ、長時間鑑賞できる時間と光へ編成する。

この定義の下では、空白は欠陥ではない。計算していないMorse graph、証明していないinvariant measure、検証していないKoopman modeは表示しない。その節度こそが、DynaMusiumの美術的な静けさと科学的な誠実さを同時に成立させる。
