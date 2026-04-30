import { MemoryRouter } from "react-router-dom";
import Homepage from "./pages/Homepage";
import { I18nProvider } from "./i18n/I18nContext";

function App() {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <I18nProvider>
        <div>
          <Homepage />
        </div>
      </I18nProvider>
    </MemoryRouter>
  );
}

export default App;
