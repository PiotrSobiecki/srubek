# Plan: Śrubek

> Source PRD: https://github.com/PiotrSobiecki/srubek/issues/1

## Architectural decisions

- **Architecture style**: jeden Worker Cloudflare z szablonu astro-on-cf. Statyczna strona z grą na canvasie plus dwa endpointy tablicy wyników. Domena `srubek.sobiecki.org`.
- **Moduły**: stan gry (maszyna stanów), układ poziomu (`buildLevel(numer, ziarno)`), boss (`makeBoss(korpus, atak, słabyPunkt, poziom)`), silnik (pętla, fizyka, kolizje, kamera, sterowanie), rysowanie (jedyny moduł dotykający canvasu), tablica wyników. Moduły poza rysowaniem testowane w Vitest bez przeglądarki.
- **Data model**: tablica wyników to jedna tabela D1: ksywka, punkty, poziom, czas zapisu. Stan gry nie jest trwały; każda gra zaczyna się od zera.
- **Key entities**: Śrubek, nakrętka, złom, dron, pies-maszyna, prasa, ładowarka, dodatkowe życie, boss (korpus × atak × słaby punkt), odcinek poziomu, wynik.
- **Sterowanie**: tylko klawiatura (strzałki/WASD, spacja, klawisz magnesu).
- **Grafika**: pixel art rysowany w kodzie, bez plików graficznych. Podstawowe sprite'y powstają w fazach 2–7, szlif w fazie 9.
- **Integrations**: Cloudflare D1 (SQL bez ORM, warstwa Neon z szablonu nieużywana), binding Rate Limiting na zapis wyniku.
- **Wynik**: punkty (nakrętki, przeciwnicy, bossowie) plus numer poziomu. `maxScore(poziom)` wspólna dla gry i serwera.
- **Determinizm**: generator poziomów i losowanie bossów zależą od ziarna, żeby testy były odtwarzalne.

---

## Phase 1: Szkielet pod domeną

**User stories**: 1, 33, 34

### What to build

Repo z szablonu zainicjowane (`init-project`), demo landing page usunięte, jedna strona z pustym canvasem i tytułem gry. Deploy na produkcję pod `srubek.sobiecki.org`. CI przechodzi lint, typy, testy i knip.

### Assumptions carried in

- DNS `sobiecki.org` jest w Cloudflare; wrangler jest zalogowany na to konto.
- Reguły szablonu o bazie Neon nie obowiązują; D1 dochodzi w fazie 8.

### Out of scope for this phase

- Jakakolwiek logika gry.
- D1, endpointy, rate limiting.

### Acceptance criteria

- [ ] `curl -sI https://srubek.sobiecki.org` zwraca 200 — [command]
- [ ] Strona zawiera element canvas i nie zawiera treści demo szablonu — [test: test strony w Vitest sprawdza obecność canvasu i brak tekstu demo]
- [ ] `pnpm lint && pnpm types && pnpm test && pnpm knip` wychodzi zerem — [command]
- [ ] CI zielone na `main` — [observable: Actions]

---

## Phase 2: Śrubek biega

**User stories**: 2, 3, 5, 17

### What to build

Pętla gry, Śrubek sterowany klawiaturą: bieg z rozbiegiem, skok o wysokości zależnej od długości wciśnięcia, grawitacja, kolizje z platformami, kamera śledząca. Odcinek 1 poziomu (platformy i nakrętki) z `buildLevel(1)`, który na razie zwraca tylko ten odcinek. HUD z punktami. Podstawowy sprite Śrubka i nakrętki.

### Assumptions carried in

- Strona z fazy 1 działa; deploy bez zmian.

### Out of scope for this phase

- Przeciwnicy, bateria, życia.
- Odcinki 2–5.
- Animacje szlifowane (faza 9).

### Acceptance criteria

- [ ] Symulacja N klatek z wciśniętym „prawo” przesuwa Śrubka w prawo i zatrzymuje go na ścianie — [test: silnik]
- [ ] Krótkie i długie wciśnięcie skoku dają różne wysokości, obie w zadanym przedziale — [test: silnik]
- [ ] Śrubek ląduje na platformie i nie przenika przez nią z dowolnej prędkości spadania — [test: silnik]
- [ ] Zebranie nakrętki podnosi punkty o stałą i usuwa nakrętkę — [test: stan gry]
- [ ] `buildLevel(1)` zwraca odcinek 1 z nakrętkami — [test: układ poziomu]
- [ ] Ręcznie: HUD pokazuje punkty rosnące podczas gry na wdrożonej wersji — [observable]

---

## Phase 3: Drony, bateria, życia

**User stories**: 4, 8, 9, 14, 15, 21

### What to build

Odcinek 2 z dronami latającymi po torze. Skok od góry niszczy drona i daje punkty; kontakt z boku odejmuje kreskę baterii. Bateria jako pasek w HUD, ładowarka uzupełnia do pełna. Trzy życia; zero baterii = utrata życia i powrót na początek poziomu z wyzerowanymi punktami bieżącego poziomu. Trzecie życie stracone = ekran końca gry, klawisz restartu daje stan początkowy. Sprite'y drona, ładowarki, HUD życia.

### Assumptions carried in

- Fizyka i kolizje z fazy 2.

### Out of scope for this phase

- Zapis wyniku (faza 8).
- Dodatkowe życie w poziomie (faza 10).

### Acceptance criteria

- [ ] Zderzenie z dronem od góry usuwa drona i dodaje punkty; z boku odejmuje kreskę baterii — [test: silnik]
- [ ] Dron porusza się po torze i zawraca na jego końcach — [test: silnik]
- [ ] Trafienie odejmuje kreskę; ładowarka uzupełnia do pełna; zero kresek = utrata życia — [test: stan gry]
- [ ] Start z 3 życiami; utrata życia zeruje punkty bieżącego poziomu, zachowuje poprzednie; po trzeciej stan „koniec gry”; restart = stan początkowy — [test: stan gry]
- [ ] `buildLevel(1)` zwraca odcinki 1–2 — [test: układ poziomu]

---

## Phase 4: Drugi skok i przepaść

**User stories**: 7

### What to build

Drugi skok w powietrzu dostępny raz na lot, odnawiany po lądowaniu. Odcinek 3 z przepaścią szerszą niż zasięg pojedynczego skoku. Wpadnięcie w przepaść = utrata życia. Efekt silniczka przy drugim skoku.

### Assumptions carried in

- Skok i życia z faz 2–3.

### Out of scope for this phase

- Magnes, prasy.

### Acceptance criteria

- [ ] Drugi skok dostępny raz na lot i odnawia się po lądowaniu — [test: silnik]
- [ ] Przepaść odcinka 3 jest szersza niż maksymalny zasięg pojedynczego skoku i węższa niż zasięg z drugim skokiem — [test: układ poziomu z użyciem stałych silnika]
- [ ] Spadnięcie poniżej dolnej krawędzi poziomu odbiera życie — [test: stan gry]

---

## Phase 5: Magnes, złom, pies-maszyna

**User stories**: 6

### What to build

Klawisz magnesu przyciąga najbliższy kawałek złomu w zasięgu; drugie wciśnięcie rzuca go w kierunku patrzenia. Rzucony złom niszczy psa-maszynę. Pies biega po platformie, zdeptanie go odejmuje baterię zamiast go niszczyć. Odcinek 4 z psem i złomem w pobliżu. Sprite'y psa i złomu.

### Assumptions carried in

- Bateria i kolizje z faz 2–3.

### Out of scope for this phase

- Rzucanie złomem w drony (działa, jeśli wyjdzie samo z kolizji, ale nie jest wymagane).

### Acceptance criteria

- [ ] Złom w zasięgu zostaje przyciągnięty i trzymany; poza zasięgiem nic się nie dzieje — [test: silnik]
- [ ] Rzucony złom trafia psa i go usuwa z punktami — [test: silnik]
- [ ] Zdeptanie psa odejmuje baterię i nie usuwa psa — [test: silnik]
- [ ] `buildLevel(1)` zwraca odcinek 4 z co najmniej jednym złomem przed psem — [test: układ poziomu]

---

## Phase 6: Prasy i cały poziom 1

**User stories**: 10, 11

### What to build

Prasy opadające w stałym cyklu; kontakt z opadającą prasą odejmuje baterię. Odcinek 5 z prasami i ładowarką przed bramą fabryki. `buildLevel(1)` zwraca pięć odcinków w ustalonej kolejności. Dotarcie do bramy przechodzi do stanu „boss”. Sprite'y prasy, bramy i tła złomowiska.

### Assumptions carried in

- Wszystkie umiejętności z faz 2–5.

### Out of scope for this phase

- Sam boss (faza 7); na razie brama kończy poziom ekranem „koniec gry” ze zwycięstwem.

### Acceptance criteria

- [ ] Prasa opada w stałym cyklu; kontakt z opadającą odejmuje baterię, z nieruchomą nie — [test: silnik]
- [ ] `buildLevel(1)` zwraca pięć odcinków w kolejności: nakrętki, drony, przepaść, pies, prasy z ładowarką — [test: układ poziomu]
- [ ] Dotarcie do bramy zmienia stan na „boss” — [test: stan gry]
- [ ] Ręcznie: poziom 1 przechodzi się od początku do bramy na wdrożonej wersji — [observable]

---

## Phase 7: Boss prasa-olbrzym

**User stories**: 12, 13

### What to build

Arena bossa po bramie. Prasa-olbrzym opada na pozycję Śrubka, po uderzeniu w ziemię odsłania rdzeń na stałą liczbę klatek. Skok w rdzeń to trafienie; trzy trafienia kończą walkę i przechodzą do końca gry ze zwycięstwem i punktami za bossa. Kontakt z opadającą prasą odejmuje baterię. `makeBoss('prasa', 'opad', 'rdzeń', 1)` jako pierwsza kombinacja. Sprite bossa.

### Assumptions carried in

- Stan „boss” z fazy 6.

### Out of scope for this phase

- Inne korpusy i ataki (faza 11).
- Skalowanie z poziomem (działa z parametrem, testowane w fazie 11).

### Acceptance criteria

- [ ] Po opadzie rdzeń odsłonięty przez stałą liczbę klatek, potem ukryty — [test: boss]
- [ ] Trafienie w odsłonięty rdzeń liczy się; poza oknem nie — [test: boss]
- [ ] Trzy trafienia kończą walkę i dodają punkty bossa — [test: stan gry]
- [ ] Ręcznie: walka przechodzi się na wdrożonej wersji — [observable]

---

## Phase 8: Tablica wyników

**User stories**: 18, 19, 20, 30, 31, 32

### What to build

Tabela D1, endpoint odczytu (najlepsze wyniki, posortowane) i zapisu (ksywka, punkty, poziom). Po końcu gry, także przy porażce, ekran z polem ksywki i podpowiedzią „ksywka, nie imię i nazwisko”. Lista najlepszych na ekranie startu i po zapisie. Serwer odrzuca wynik większy niż `maxScore(poziom)`; ta sama funkcja w grze. Binding Rate Limiting na zapis.

### Assumptions carried in

- Stan „koniec gry” z fazy 3 zna punkty i poziom.

### Out of scope for this phase

- Filtr słów, panel admina.

### Acceptance criteria

- [ ] POST z poprawną ksywką i wynikiem tworzy wiersz; GET zwraca posortowaną listę — [test: endpointy na lokalnym D1]
- [ ] Ksywka pusta lub dłuższa niż limit = 400 — [test: endpointy]
- [ ] Wynik równy `maxScore(poziom)` przechodzi, o 1 większy = 422 — [test: `maxScore` i endpoint]
- [ ] Ręcznie: 20 POST w minucie z jednego adresu, od progu 429 — [observable]
- [ ] Ręcznie: `DELETE` w konsoli D1 usuwa wiersz, tablica go nie pokazuje — [observable]
- [ ] Ręcznie: ekran zapisu pokazuje podpowiedź o ksywce — [observable]

---

## Phase 9: Pixel art i płynność

**User stories**: 28, 29

### What to build

Szlif grafiki: cieniowanie sprite'ów, animacje biegu, skoku, drugiego skoku, rzutu, trafienia, zniszczenia przeciwnika, tło złomowiska z paralaksą. Licznik klatek w trybie debug.

### Assumptions carried in

- Wszystkie encje mają podstawowe sprite'y z faz 2–7.

### Out of scope for this phase

- Dźwięk.
- Nowe mechaniki.

### Acceptance criteria

- [ ] Każda animacja ma zdefiniowaną liczbę klatek i zapętla się bez skoku — [test: rysowanie, metadane animacji]
- [ ] Ręcznie: licznik pokazuje 60 kl./s na laptopie właściciela — [observable]
- [ ] Ręcznie: akceptacja wyglądu przez właściciela — [observable]

---

## Phase 10: Generator poziomów

**User stories**: 16, 22, 23, 24, 27

### What to build

`buildLevel(n, ziarno)` dla n > 1 losuje odcinki z puli (te same pięć typów z parametrami trudności) i składa poziom. Po pokonaniu bossa przejście do poziomu n+1 z zachowaniem punktów. Miara trudności (liczba przeciwników, szerokość przepaści, tempo pras) rośnie łagodnie do 100 i jest stała dalej. Dodatkowe życie pojawia się rzadko. HUD z numerem poziomu.

### Assumptions carried in

- Odcinki z faz 2–6 sparametryzowane trudnością.

### Out of scope for this phase

- Nowe typy odcinków.

### Acceptance criteria

- [ ] `buildLevel(n, s)` dla n > 1 daje różne sekwencje dla różnych ziaren i identyczne dla tego samego — [test: układ poziomu]
- [ ] Miara trudności rośnie monotonicznie od 1 do 100 i jest stała powyżej — [test: układ poziomu]
- [ ] 100 kolejnych poziomów generuje się bez błędu — [test: układ poziomu]
- [ ] Dodatkowe życie występuje w zadanym ułamku poziomów (statystycznie na 1000 ziarnach) — [test: układ poziomu]
- [ ] Pokonanie bossa przechodzi do n+1 z zachowanymi punktami — [test: stan gry]

---

## Phase 11: Bossowie z części

**User stories**: 25, 26

### What to build

Pula 10 korpusów, 10 ataków, 3 słabych punktów z listą dopuszczalnych par korpus–atak. Losowanie po każdym poziomie bez powtórek w jednym przejściu. Wytrzymałość i prędkość rosną z poziomem. Korpusy dokładane partiami; każda partia to osobny plaster z własnymi sprite'ami i testami ataków.

### Assumptions carried in

- `makeBoss` i arena z fazy 7.

### Out of scope for this phase

- Bossowie o unikalnych mechanikach poza pulą.

### Acceptance criteria

- [ ] 100 losowań w jednym przejściu nie daje dwóch identycznych trójek ani niedopuszczalnej pary — [test: boss]
- [ ] Wytrzymałość i prędkość dla n+10 większe niż dla n — [test: boss]
- [ ] Każdy korpus z partii ma test swojego ataku i słabego punktu — [test: boss]
- [ ] Ręcznie: akceptacja wyglądu każdej partii — [observable]
