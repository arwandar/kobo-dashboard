import express from "express";
import axios from "axios";

const app = express();

// Variables d'environnement
const TODOIST_TOKEN = process.env.TODOIST_TOKEN;
const TODOIST_LABEL = "kobo";
const HOME_ASSISTANT_URL = process.env.HOME_ASSISTANT_URL;
const HOME_ASSISTANT_TOKEN = process.env.HOME_ASSISTANT_TOKEN;
const PORT = process.env.PORT || 5174;

if (!TODOIST_TOKEN) {
    console.error("❌ ERREUR : La variable TODOIST_TOKEN doit être définie.");
    process.exit(1);
}

app.use(express.urlencoded({ extended: true }));

const todoistApi = axios.create({
    baseURL: 'https://api.todoist.com/api/v1',
    headers: { Authorization: `Bearer ${TODOIST_TOKEN}` }
});

const homeAssistantApi = HOME_ASSISTANT_URL && HOME_ASSISTANT_TOKEN
    ? axios.create({
        baseURL: HOME_ASSISTANT_URL,
        headers: { Authorization: `Bearer ${HOME_ASSISTANT_TOKEN}` }
    })
    : undefined;

type Task = {
    id: string;
    content: string;
    labels: string[];
    due?: {
        date: string;
        is_recurring: boolean;
    } | null;
};

async function getTasksByLabel() {
    const targetLabel = TODOIST_LABEL.toLowerCase().trim();
    try {
        const response = await todoistApi.get('/tasks/filter', {
            params: {
                query: `(overdue | today) & @${targetLabel}`
            }
        });
        const tasks: Task[] = response.data.results || [];

        return tasks

    } catch (error) {
        console.error('Erreur API Todoist:', ((error as Error).message as string) || error);
    }
}

async function getHomeAssistantState(entityId: string): Promise<string | undefined> {
    if (!homeAssistantApi) return undefined;

    try {
        const response = await homeAssistantApi.get<{ state: string }>(`/api/states/${entityId}`);
        return response.data.state;
    } catch {
        console.error(`Erreur API Home Assistant pour ${entityId}.`);
    }
}

function escapeHtml(value: string) {
    const replacements: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    return value.replace(/[&<>"']/g, character => replacements[character]);
}

app.get('/', async (req, res) => {
    const [tasks, lunch, dinner] = await Promise.all([
        getTasksByLabel(),
        getHomeAssistantState('input_text.mealie_today_lunch'),
        getHomeAssistantState('input_text.mealie_today_dinner')
    ]);
    const mealFallback = homeAssistantApi ? 'Indisponible' : 'Non configuré';

    let html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="120">
        <style>
            body { font-family: sans-serif; background-color: #fff; color: #000; margin: 0; padding: 15px; text-align: center; }
            .meal-line { font-size: 24px; font-weight: bold; text-align: left; margin: 8px 0; padding: 8px 5px; border-bottom: 2px solid #000; }
            h1 { font-size: 32px; border-bottom: 4px solid #000; padding-bottom: 10px; text-transform: uppercase; }
            .task-btn { display: block; width: 95%; margin: 15px auto; padding: 25px 15px; font-size: 26px; font-weight: bold; color: #000; background-color: #fff; border: 4px solid #000; border-radius: 10px; text-align: left; cursor: pointer; }
            .empty { font-size: 28px; margin-top: 80px; font-weight: bold; }
        </style>
    </head>
    <body>
        <p class="meal-line">Déjeuner : ${escapeHtml(lunch || mealFallback)}</p>
        <p class="meal-line">Dîner : ${escapeHtml(dinner || mealFallback)}</p>
        <h1>🧺 TÂCHES : ${TODOIST_LABEL.toUpperCase()}</h1>
    `;
    if (tasks === undefined) {
        html += `<div class="empty">❌ Erreur lors de la récupération des tâches.</div>`;
    } else if (tasks.length === 0) {
        html += `<div class="empty">✅ Aucune tâche à faire !</div>`;
    } else {
        tasks.forEach((task: Task) => {
            html += `
                <form action="/complete" method="POST">
                    <input type="hidden" name="task_id" value="${escapeHtml(task.id)}">
                    <button type="submit" class="task-btn">
                        [ ] ${escapeHtml(task.content)}
                    </button>
                </form>
            `;
        });
    }

    html += `</body></html>`;
    res.send(html);
});

app.post('/complete', async (req, res) => {
    const { task_id } = req.body;

    if (task_id) {
        try {
            await todoistApi.post(`/tasks/${task_id}/close`);
            console.log(`Tâche Todoist ${task_id} fermée avec succès !`);

            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error('Erreur lors de la fermeture Todoist:', ((error as Error).message as string) || error);
        }
    }

    res.redirect('/');
});

app.listen(PORT, () => {
    console.log(`Serveur Kobo-Todoist direct démarré sur le port ${PORT}`);
});