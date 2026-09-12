# mktcap metro-mapping research -- 2026-09-12

Output of the `mktcap-weekly-metro-mapping-research` cloud routine (proposal-only,
per `scripts/mktcap/README.md`'s never-guess rule -- nothing here has been applied
to Supabase). This routine has no `service_role` key and could not write to
`mktcap_geo` even if it wanted to; every row below is a candidate for Ashwin (or a
session with write access) to apply via the SQL pattern documented at the top of
`mac-mini-jobs/mktcap-review-queue.md`.

**This run covered the full 200-company standing backlog** in that file (ordered by
market cap), not just the smaller "new this run" delta -- the README documents that
file as the channel this routine reads end to end.

**Caveat:** the Supabase precedent-check step (comparing borderline satellite-city
calls against existing `mapped_by` rulings) was blocked by this session's sandbox
egress proxy (403), same failure mode as ntfy.sh. Rows below flagged "borderline --
verify" were NOT checked against precedent and should get a second look before
applying. WebSearch quota also ran out partway through the last 20-company batch,
which is why a few HQs are marked not found rather than resolved.

## Counts

- Reviewed: 200
- Proposed: 139 (127 confident, 12 borderline -- verify)
- Skipped: 61 (10 HQ not found/verified, 4 data-quality flags, 47 confirmed HQ but no tracked metro nearby)

## Proposed mappings

| Symbol | Company | HQ | Proposed metro | Notes |
|---|---|---|---|---|
| 000990.KS | DB HiTek | Bucheon (~27km) | Seoul | |
| 0142.HK | First Pacific Company | Central, Hong Kong | Hong Kong | |
| 018880.KS | Hanon Systems | Daejeon | Daejeon | |
| 052690.KS | KEPCO Engineering & Construction Company | Gimcheon, Gyeongsangbuk-do | Gimcheon | |
| 066970.KS | L&F Co., Ltd. | Daegu | Daegu | |
| 108490.KQ | ROBOTIS | Seoul (Gangseo-gu) | Seoul | |
| 128940.KS | Hanmi Pharm | Seoul | Seoul | |
| 175330.KS | JB Financial Group | Jeonju, Jeollabuk-do | Jeonju | |
| 1860.T | TODA Corp | Chuo-ku, Tokyo | Tokyo | |
| 2343.HK | Pacific Basin Shipping | Hong Kong (Wong Chuk Hang) | Hong Kong | |
| 2531.T | Takara Holdings | Kyoto (Shimogyo-ku) | Osaka-Kyoto-Kobe | |
| 4004.SR | Dallah Healthcare | Riyadh | Riyadh | |
| 4205.T | Zeon Corporation | Chiyoda, Tokyo | Tokyo | |
| 4401.T | Adeka Corporation | Arakawa, Tokyo | Tokyo | |
| 4967.T | KOBAYASHI Pharmaceutical | Osaka | Osaka-Kyoto-Kobe | |
| 5233.T | Taiheiyo Cement | Minato, Tokyo | Tokyo | |
| 5444.T | Yamato Kogyo | Himeji, Hyogo | Osaka-Kyoto-Kobe | |
| 5471.T | Daido Steel | Higashi-ku, Nagoya | Nagoya | |
| 6753.T | Sharp Corporation | Osaka (Chuo-ku) | Osaka-Kyoto-Kobe | |
| 6770.T | Alps Alpine Co., Ltd. | Ota, Tokyo | Tokyo | |
| 6787.T | Meiko Electronics | Ayase, Kanagawa (~40km; Kanagawa is Tokyo's state2) | Tokyo | borderline -- verify |
| 6923.T | Stanley Electric | Meguro, Tokyo | Tokyo | |
| 7003.T | MITSUI E&S | Tokyo (Chuo-ku, Tsukiji) | Tokyo | |
| 7277.KL | Dialog Group | Petaling Jaya (~10km) | Kuala Lumpur | |
| 7380.T | Juroku Financial Group | Gifu (~30km; Gifu is Nagoya's state3) | Nagoya | borderline -- verify |
| 7649.T | Sugi Holdings | Obu, Aichi (~15km) | Nagoya | |
| 8056.T | BIPROGY | Koto-ku, Tokyo | Tokyo | |
| 8230.SR | Al Rajhi Company for Cooperative Insurance | Riyadh | Riyadh | |
| 8304.T | Aozora Bank | Chiyoda, Tokyo | Tokyo | |
| 8313.SR | Rasan Information Technology Company | Riyadh | Riyadh | |
| 9076.T | Seino Holdings | Ogaki, Gifu (~40km) | Nagoya | borderline -- verify |
| 9507.T | Shikoku Electric Power Company | Takamatsu, Kagawa | Takamatsu | |
| 9533.T | Toho Gas | Atsuta-ku, Nagoya | Nagoya | |
| 9989.T | Sundrug | Fuchu, Tokyo | Tokyo | |
| ABK.KW | Al Ahli Bank of Kuwait | Kuwait City (Safat) | Kuwait City | |
| ABM | ABM Industries | New York, New York | New York | |
| ABQK.QA | Ahli Bank (Qatar) | Doha | Doha | |
| AD | Array Digital Infrastructure | Chicago, Illinois | Chicago | |
| ADEA | Adeia | San Jose, CA | San Francisco-San Jose | |
| ADPT | Adaptive Biotechnologies | Seattle, Washington | Seattle | |
| ALRM | Alarm.com | Tysons, VA | Washington-Baltimore | |
| ALS.TO | Altius Minerals | St. John's, Newfoundland and Labrador | St. John's | |
| ASO | Academy Sports + Outdoors | Katy, TX | Houston | |
| ATAI | atai Life Sciences | Berlin | Berlin | |
| ATRC | AtriCure | Mason, OH (~35km) | Cincinnati | borderline -- verify |
| AVAH | Aveanna Healthcare | Atlanta, Georgia | Atlanta | |
| BBK.BH | Bank of Bahrain and Kuwait | Manama | Manama | |
| BCGE.SW | Banque Cantonale de Geneve | Geneva | Geneva | |
| BDB.MI | Banco di Desio e della Brianza | Desio | Milan | |
| BDT.TO | Bird Construction | Mississauga, ON | Toronto | |
| BHE | Benchmark Electronics | Tempe, AZ | Phoenix | |
| BRE.MI | Brembo | Curno, Bergamo (~44km) | Milan | borderline -- verify |
| BUOU.SI | Frasers Logistics & Industrial Trust | Singapore | Singapore | |
| CAF.MC | Construcciones y Auxiliar de Ferrocarriles | Beasain, Basque Country | Beasain | |
| CCC.WA | CCC S.A. | Polkowice | Polkowice | |
| CELC | Celcuity Inc. | Minneapolis, Minnesota | Minneapolis | |
| CHRN | ChronoScale | Dallas, Texas | Dallas | |
| CMCX.L | CMC Markets Plc | London | London | |
| COFA.PA | Coface | Bois-Colombes (~10km) | Paris | |
| COHU | Cohu | Poway, CA (~28km) | San Diego | |
| COLBUN.SN | Colbun | Las Condes, Santiago | Santiago | |
| CPIN.JK | Charoen Pokphand Indonesia | Jakarta | Jakarta | |
| CSAN | Cosan | Sao Paulo | Sao Paulo | |
| CSQR | Csquare, Inc. | Coppell, TX | Dallas | |
| CVSA | Covista Inc. | Chicago, Illinois | Chicago | |
| CXT | Crane NXT | Stamford, CT (~50km; classic NY-metro corp hub) | New York | borderline -- verify |
| DAC | Danaos | Piraeus (~8km, port of Athens) | Athens | |
| DESN.SW | Dottikon ES | Dottikon, Aargau (~25km) | Zurich | |
| DIA.MC | (DIA) Distribuidora Internacional | Las Rozas de Madrid | Madrid | |
| DNOW | DNOW Inc. | Houston, Texas | Houston | |
| DOFG.OL | DOF Group | Storebo (~34km) | Bergen | borderline -- verify |
| EEFT | Euronet Worldwide | Leawood, KS | Kansas City | |
| EFXT | Enerflex | Calgary, Alberta | Calgary | |
| ELG.DE | Elmos Semiconductor | Dortmund (named-region) | Rhine-Ruhr | borderline -- verify |
| ELTR.TA | Electra | Ramat Gan | Tel-Aviv | |
| ENA.WA | Enea | Poznan | Poznan | |
| ENJSA.IS | Enerjisa Enerji | Istanbul (Atasehir) | Istanbul | |
| ENRG.TA | Energix Renewable Energies | Ramat Gan | Tel-Aviv | |
| EROC | ERock, Inc. | Houston, Texas | Houston | |
| ESENTIAII.MX | Esentia Energy Systems | Mexico City | Mexico City | |
| Element Labs(Uni) | Element Labs | Tel Aviv | Tel-Aviv | |
| FFC.PK | Fauji Fertilizer Company | Rawalpindi | Islamabad | |
| FG | F&G Annuities & Life, Inc. | Des Moines, Iowa | Des Moines | |
| FIGR | Figure Technology Solutions | Reno, Nevada | Reno | |
| GNTX | Gentex | Zeeland, MI | Grand Rapids | |
| GRDN | Guardian Pharmacy Services | Atlanta (Cobb County), Georgia | Atlanta | |
| GTX | Garrett Motion | Rolle (~16km) | Lausanne | |
| GVYM.TA | Gav-Yam Lands | Haifa | Haifa | |
| Galaxea AI(Uni) | Galaxea AI | Suzhou | Suzhou | |
| HACK.ST | Hacksaw AB | Stockholm | Stockholm | |
| HATSUN.NS | Hatsun Agro Products | Chennai, Tamil Nadu | Chennai | |
| HSAI | Hesai Group | Shanghai (Changning District) | Shanghai | |
| HTWS.L | Helios Towers | London | London | |
| Haworth | Haworth | Holland, MI (~40km; official Grand Rapids-Holland CSA) | Grand Rapids | borderline -- verify |
| IHS | IHS Towers | London | London | |
| IMAX | Imax Corp | Mississauga, ON | Toronto | |
| INKP.JK | Indah Kiat Pulp & Paper | Jakarta | Jakarta | |
| IOND | Ionic Digital | Washington, D.C. | Washington-Baltimore | |
| IPCO.TO | International Petroleum | Vancouver, British Columbia | Vancouver | |
| JUN3.F | Jungheinrich | Hamburg | Hamburg | |
| KALMAR.HE | Kalmar Oyj | Helsinki | Helsinki | |
| KD | Kyndryl | New York, New York | New York | |
| KLR.L | Keller Group | London | London | |
| KWR | Quaker Houghton | Conshohocken, PA | Philadelphia | |
| LCLN | Lincoln International, Inc. | Chicago, Illinois | Chicago | |
| LGN | Legence Corp. | San Jose, CA | San Francisco-San Jose | |
| LICHSGFIN.NS | LIC Housing Finance | Mumbai, Maharashtra | Mumbai | |
| LSG.OL | Leroy Seafood | Bergen | Bergen | |
| MULT3.SA | Multiplan Empreendimentos Imobiliarios | Rio de Janeiro | Rio de Janeiro | |
| NTCT | NETSCOUT | Westford, MA (~39km) | Boston | borderline -- verify |
| OIL.NS | Oil India | Noida, UP (corp office) | Delhi | |
| OOREDOO.KW | National Mobile Telecommunications Company | Kuwait City | Kuwait City | |
| PAGS | PagSeguro | Sao Paulo | Sao Paulo | |
| PATANJALI.NS | Patanjali Foods | Indore, Madhya Pradesh | Indore | |
| PDI.AX | Predictive Discovery Limited | South Perth, WA | Perth | |
| PEL.NS | Piramal Enterprises | Mumbai, Maharashtra | Mumbai | |
| PPLI | People Incorporated | New York, New York | New York | |
| QNT | Quantinuum Inc. | Broomfield, CO | Denver | |
| REDINGTON.NS | Redington India | Chennai, Tamil Nadu | Chennai | |
| ROKO-B.ST | Roko AB | Stockholm | Stockholm | |
| S59.SI | SIA Engineering Company | Singapore | Singapore | |
| SCHO.CO | Aktieselskabet Schouw & Co. | Aarhus, Region Midtjylland | Aarhus | |
| SFNC | Simmons First National | Pine Bluff, Arkansas | Pine Bluff | |
| SISE.IS | Sisecam | Tuzla, Istanbul | Istanbul | |
| SLDE | Slide Insurance | Tampa, Florida | Tampa | |
| SLNO | Soleno Therapeutics | Redwood City, CA | San Francisco-San Jose | |
| SLR.MC | Solaria Energia | Madrid | Madrid | |
| SPOL.OL | SpareBank 1 | Stavanger | Stavanger | |
| SRAIL.SW | Stadler Rail | Bussnang (~24km) | St. Gallen | |
| SYAB.VI | SYNLAB | Munich, Bavaria | Munich | |
| Spirit AI(Uni) | Spirit AI | Hangzhou | Hangzhou | |
| TRALT.IS | Turk Altin Isletmeleri A.S. | Ankara | Ankara | |
| TRMK | Trustmark | Jackson, Mississippi | Jackson | |
| VC | Visteon | Van Buren Twp, MI (~37km) | Detroit | borderline -- verify |
| VGNT | Versigent | Schaffhausen | Schaffhausen | |
| VLK.AS | Van Lanschot Kempen | 's-Hertogenbosch (~32km) | Eindhoven | borderline -- verify |
| VMRK | Vivmark Residential | Arlington, VA | Washington-Baltimore | |
| VSXY | Victoria's Secret & Co | Reynoldsburg, OH | Columbus | |
| WOR | Worthington Enterprises | Columbus, Ohio | Columbus | |

## Skipped

**No authoritative HQ source found, or WebSearch quota ran out (10):**
AVPT, CMPC.SN, DAE.SW, JEN.F, METROBRAND.NS, NBTB, OTEL.OM, SUNB, TTAM, VRLA.PA

**Data-quality flags -- need a human ruling before any metro decision, not just a location lookup (4):**

- `JOYY`: queue lists country=China but sourced HQ is Singapore (2019 relocation) -- country field looks stale
- `KYIV`: queue lists country=UAE (Nasdaq holding-entity domicile) but operating HQ is Kyiv, Ukraine
- `SYRMA.NS`: registered office Mumbai vs. operational base Chennai -- conflicting sources, genuinely ambiguous
- `9008.T`: Keio Corporation -- sources conflict on Tama vs. historic Shinjuku HQ; distance to Tokyo differs materially between the two

**Confirmed HQ, but genuinely far from every tracked metro in that country -- likely `no-metro` candidates (47):**

`082740.KS`, `1818.HK`, `2083.SR`, `240810.KQ`, `336260.KS`, `600426.SS`, `6323.T`, `688303.SS`, `7564.T`, `8334.T`, `8368.T`, `9831.T`, `ALSYDB.CO`, `BAKKA.OL`, `BC8.F`, `BLX.TO`, `CALY`, `CLAS-B.ST`, `DIMRI.TA`, `DOO`, `EMP-A.TO`, `FNTN.F`, `GL9.IR`, `GPGI`, `GVA`, `HNI`, `IFCN.SW`, `ISDMR.IS`, `KARURVYSYA.NS`, `KWS.F`, `LOUP.PA`, `Life Care Centers of America`, `MGRC`, `MHK`, `NLCINDIA.NS`, `PEAB-B.ST`, `RBREW.CO`, `SALM.OL`, `SJVN.NS`, `SPNT`, `SQN.SW`, `SRP.L`, `STJ.L`, `SZG.F`, `UCB`, `WTTR`, `xsquare(Uni)`

