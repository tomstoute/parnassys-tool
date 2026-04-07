const { useState, useEffect } = React;
const Upload = () => <span>📤</span>;
const FileSpreadsheet = () => <span>📊</span>;
const Loader2 = () => <span>⏳</span>;
const CheckCircle2 = () => <span>✅</span>;
const AlertCircle = () => <span>⚠️</span>;
const Download = () => <span>⬇️</span>;
const FileText = () => <span>📄</span>;
const Activity = () => <span>⚡</span>;
const App = () => {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, loading-libs, extracting, analyzing, complete, error
  const [progress, setProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [extractedData, setExtractedData] = useState(null);
  const [subject, setSubject] = useState('');
  const [libsLoaded, setLibsLoaded] = useState(false);

  const apiKey = "AIzaSyAvybS3_WYo2-sh4H2qWZClKERK1Eaa14Y"; // De omgeving injecteert de API-key automatisch bij uitvoering

  // Dynamisch laden van benodigde bibliotheken (PDF.js en SheetJS)
  useEffect(() => {
    const loadScripts = async () => {
      setStatus('loading-libs');
      const scripts = [
        { id: 'pdfjs', src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' },
        { id: 'xlsx', src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' }
      ];

      for (const s of scripts) {
        if (!document.getElementById(s.id)) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.id = s.id;
            script.src = s.src;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Bibliotheek ${s.id} kon niet worden geladen.`));
            document.head.appendChild(script);
          });
        }
      }
      
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      
      setLibsLoaded(true);
      setStatus('idle');
    };

    loadScripts().catch(err => {
      setErrorMessage("Systeemfout: Kon de verwerkingsmodules niet laden.");
      setStatus('error');
    });
  }, []);

  const extractTextFromPdf = async (file) => {
    try {
      setProgress("PDF inladen...");
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      let fullText = "";
      
      const numPages = Math.min(pdf.numPages, 20); // Limiet tot 20 pagina's voor stabiliteit
      
      for (let i = 1; i <= numPages; i++) {
        setProgress(`Tekst extraheren: pagina ${i} van ${numPages}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += `[PAGINA ${i}]\n${pageText}\n\n`;
      }
      return fullText;
    } catch (err) {
      throw new Error("Het PDF-bestand is onleesbaar of beveiligd.");
    }
  };

  const analyzeWithGemini = async (text) => {
    setProgress("Gegevens structureren met AI...");
    
    // Gebruik van een strikt JSON-schema om 'hangen' door foute parsing te voorkomen
    const responseSchema = {
      type: "OBJECT",
      properties: {
        leergebied: { type: "STRING" },
        items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              leerlijn: { type: "STRING" },
              niveau: { type: "STRING" },
              doel: { type: "STRING" },
              leerlingen: { type: "ARRAY", items: { type: "STRING" } }
            },
            required: ["leerlijn", "niveau", "doel", "leerlingen"]
          }
        }
      },
      required: ["leergebied", "items"]
    };

    const systemPrompt = `
      Je bent een ParnasSys data-analist. Je taak is het extraheren van leerlijnen, doelen en leerlingen.
      
      REGELS:
      1. Extraheer het Leergebied (titel).
      2. Voor elk doel: Leerlijn, Niveau, Doelomschrijving en ALLE leerlingen.
      3. Groepsnummering: Als een leerlijn vaker voorkomt in de tekst (voor verschillende groepen), nummer ze dan: "[Naam] groep 1", "[Naam] groep 2", etc.
      4. Sorteer de items op Leerlijn, dan Niveau, dan Doel.
      5. Negeer vinkjes, symbolen of kleuren.
    `;

    const userQuery = `Analyseer de volgende tekst uit een ParnasSys PDF en geef de resultaten terug in het gevraagde JSON formaat:\n\n${text}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userQuery }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { 
            responseMimeType: "application/json",
            responseSchema: responseSchema
          }
        })
      });

      if (!response.ok) throw new Error("De AI-service is momenteel niet bereikbaar.");
      
      const result = await response.json();
      const rawOutput = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawOutput) throw new Error("Geen geldige data ontvangen van de analyse.");
      
      return JSON.parse(rawOutput);
    } catch (error) {
      console.error("AI Analysis Error:", error);
      throw new Error("De AI-verwerking is onderbroken. Probeer het bestand opnieuw te uploaden.");
    }
  };

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;
    
    if (uploadedFile.type !== 'application/pdf') {
      setErrorMessage('Selecteer a.u.b. een PDF-bestand.');
      setStatus('error');
      return;
    }

    setFile(uploadedFile);
    setStatus('extracting');
    setErrorMessage('');
    setProgress('Starten...');

    try {
      const text = await extractTextFromPdf(uploadedFile);
      if (!text.trim() || text.length < 10) throw new Error("De PDF bevat geen leesbare tekst.");
      
      setStatus('analyzing');
      const analyzed = await analyzeWithGemini(text);
      
      if (!analyzed.items || analyzed.items.length === 0) {
        throw new Error("Er zijn geen leerlijnen of doelen gevonden in dit document.");
      }

      setExtractedData(analyzed.items);
      setSubject(analyzed.leergebied || "ParnasSys Overzicht");
      setStatus('complete');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error.message);
    }
  };

  const exportToExcel = () => {
    if (!extractedData || !window.XLSX) return;

    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();
    const rows = [];
    
    rows.push([subject.toUpperCase()]);
    rows.push([`Periode: ....................`]);
    rows.push([]); 

    rows.push([
      "Leerlijn", "Niveau", "Doel", "Leerling", 
      "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"
    ]);

    extractedData.forEach((item) => {
      item.leerlingen.forEach((student) => {
        rows.push([
          item.leerlijn,
          item.niveau,
          item.doel,
          student,
          "", "", "", "", "", "", "", "", "", ""
        ]);
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Styling metadata (voor kolombreedte)
    ws['!cols'] = [
      { wch: 30 }, { wch: 10 }, { wch: 55 }, { wch: 25 },
      { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Groepswerkplan");
    XLSX.writeFile(wb, `ParnasSys_Export_${subject.replace(/\s/g, '_')}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-12 font-sans text-slate-900">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200">
              <FileSpreadsheet className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">
            ParnasSys <span className="text-indigo-600">Excel Tool</span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Van PDF naar direct bruikbare afvinklijsten.</p>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/60 overflow-hidden border border-slate-100">
          <div className={`p-10 flex flex-col items-center justify-center min-h-[350px] transition-all duration-500 ${status === 'idle' ? 'bg-white' : 'bg-slate-50/50'}`}>
            
            {status === 'loading-libs' && (
              <div className="flex flex-col items-center animate-pulse">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                <p className="font-bold text-slate-400">Componenten laden...</p>
              </div>
            )}

            {status === 'idle' && (
              <div className="w-full max-w-md text-center">
                <label className="group relative flex flex-col items-center justify-center w-full h-64 border-4 border-dashed border-slate-200 rounded-[2rem] cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all duration-300">
                  <div className="flex flex-col items-center justify-center p-6">
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="w-8 h-8 text-indigo-600" />
                    </div>
                    <p className="text-lg font-bold text-slate-700">Sleep je PDF hierheen</p>
                    <p className="text-sm text-slate-400 mt-1">of klik om te bladeren</p>
                  </div>
                  <input type="file" className="hidden" accept="application/pdf" onChange={handleFileUpload} />
                </label>
                <p className="mt-6 text-xs text-slate-400 uppercase tracking-widest font-bold">Ondersteunt alle ParnasSys formaten</p>
              </div>
            )}

            {(status === 'extracting' || status === 'analyzing') && (
              <div className="flex flex-col items-center text-center">
                <div className="relative w-32 h-32 mb-8">
                  <div className="absolute inset-0 border-8 border-indigo-50 rounded-full"></div>
                  <div className="absolute inset-0 border-8 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                  <Activity className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 text-indigo-600 animate-pulse" />
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-2">Bezig met verwerken</h2>
                <div className="px-6 py-2 bg-indigo-100 text-indigo-700 rounded-full text-sm font-bold animate-bounce">
                  {progress}
                </div>
              </div>
            )}

            {status === 'complete' && (
              <div className="flex flex-col items-center text-center">
                <div className="w-24 h-24 bg-green-100 text-green-600 rounded-[2rem] flex items-center justify-center mb-6 shadow-xl shadow-green-100">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-2">Analyse geslaagd!</h2>
                <p className="text-slate-400 mb-8 font-medium">Het bestand voor <strong>{subject}</strong> is klaar voor gebruik.</p>
                <div className="flex flex-wrap gap-4 justify-center">
                  <button onClick={exportToExcel} className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-5 rounded-2xl font-black shadow-xl shadow-indigo-200 transition-all active:scale-95 group">
                    <Download className="w-6 h-6 group-hover:translate-y-0.5 transition-transform" /> 
                    DOWNLOAD EXCEL
                  </button>
                  <button onClick={() => setStatus('idle')} className="px-10 py-5 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-all">
                    NIEUWE UPLOAD
                  </button>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center text-center max-w-sm">
                <div className="w-20 h-20 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6">
                  <AlertCircle className="w-10 h-10" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Verwerking gestopt</h2>
                <p className="text-red-500/80 mb-8 font-medium leading-relaxed">{errorMessage}</p>
                <button onClick={() => setStatus('idle')} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-bold shadow-lg transition-all active:scale-95">
                  OPNIEUW PROBEREN
                </button>
              </div>
            )}
          </div>

          {status === 'complete' && extractedData && (
            <div className="border-t border-slate-100 overflow-x-auto">
              <div className="bg-slate-50 p-4 border-b border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preview van de tabel</p>
              </div>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-white text-slate-400 font-bold uppercase tracking-tighter">
                    <th className="p-4 text-left border-r w-40">Leerlijn</th>
                    <th className="p-4 text-left border-r w-16">Niveau</th>
                    <th className="p-4 text-left border-r">Doelomschrijving</th>
                    <th className="p-4 text-left border-r w-40">Leerling</th>
                    {[...Array(10)].map((_, i) => (
                      <th key={i} className={`p-2 text-center w-10 border-r ${i < 8 ? 'bg-green-50/50 text-green-600' : 'bg-red-50/50 text-red-600'}`}>
                        {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {extractedData.map((item, idx) => {
                    const prevItem = extractedData[idx - 1];
                    let rowClass = "bg-white border-b border-slate-100";
                    
                    if (prevItem) {
                      const basePrev = prevItem.leerlijn.replace(/ groep \d+$/, '');
                      const baseCurr = item.leerlijn.replace(/ groep \d+$/, '');
                      if (basePrev !== baseCurr) rowClass += " border-t-4 border-slate-900";
                      else if (prevItem.leerlijn !== item.leerlijn) rowClass += " border-t-2 border-slate-400";
                    }

                    return item.leerlingen.map((student, sIdx) => (
                      <tr key={`${idx}-${sIdx}`} className={`${rowClass} hover:bg-slate-50/50 transition-colors`}>
                        <td className="p-4 font-black text-slate-900 border-r bg-slate-50/30">{sIdx === 0 ? item.leerlijn : ""}</td>
                        <td className="p-4 border-r text-slate-500 font-medium">{sIdx === 0 ? item.niveau : ""}</td>
                        <td className="p-4 border-r leading-snug font-medium text-slate-700">{sIdx === 0 ? item.doel : ""}</td>
                        <td className="p-4 border-r italic text-indigo-700 bg-indigo-50/10 font-bold whitespace-nowrap">{student}</td>
                        {[...Array(10)].map((_, i) => (
                          <td key={i} className={`p-2 border-r text-center ${i < 8 ? 'bg-green-50/5' : 'bg-red-50/5'}`}>
                            <div className="w-5 h-5 border-2 border-slate-200 rounded bg-white mx-auto shadow-sm"></div>
                          </td>
                        ))}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <footer className="mt-8 text-center text-slate-400 text-xs font-medium">
          Dikke lijnen scheiden de leerlijnen • Middeldikke lijnen scheiden de groepen
        </footer>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
