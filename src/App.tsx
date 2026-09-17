import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

const NO_DRAG_SELECTOR = "button, input, a, [data-no-drag]";

function handleDragStart(e: React.MouseEvent<HTMLDivElement>) {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement;
  if (target.closest(NO_DRAG_SELECTOR)) return;
  getCurrentWindow().startDragging();
}

function App() {
  return (
    <div className="mp-root" onMouseDown={handleDragStart}>
      <div className="mp-window">
        <div className="mp-meta">
          <div className="mp-title">S1 window spike</div>
          <div className="mp-artist">drag anywhere · buttons stay clickable</div>
        </div>
        <div className="mp-controls">
          <button
            data-no-drag
            className="mp-btn-prev"
            onClick={() => console.log("prev clicked")}
          >
            ⏮
          </button>
          <button
            data-no-drag
            className="mp-btn-play"
            onClick={() => console.log("play clicked")}
          >
            ⏵
          </button>
          <button
            data-no-drag
            className="mp-btn-next"
            onClick={() => console.log("next clicked")}
          >
            ⏭
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
