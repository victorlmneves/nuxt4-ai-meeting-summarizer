import type { IActionItem } from '~/types';

// ── Date parsing ──────────────────────────────────────────────────────────────
// Tries to extract a real date from informal deadline strings like:
// "end of next week", "Friday", "March 15", "EOD Monday", "2025-03-15", "by 28 Feb"

function parseDeadline(deadline: string, meetingDate = new Date()): Date | null {
    if (!deadline || deadline === 'No deadline set') {
        return null;
    }

    const deadlineStr = deadline.toLowerCase().trim();
    const now = new Date(meetingDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // ISO date: 2025-03-15
    const iso = deadlineStr.match(/(\d{4})-(\d{2})-(\d{2})/);

    if (iso) {
        return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }

    // DD/MM/YYYY or MM/DD/YYYY
    const slashed = deadlineStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);

    if (slashed) {
        return new Date(Number(slashed[3]), Number(slashed[2]) - 1, Number(slashed[1]));
    }

    // "15 march" or "march 15"
    const months: Record<string, number> = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11,
        january: 0,
        february: 1,
        march: 2,
        april: 3,
        june: 5,
        july: 6,
        august: 7,
        september: 8,
        october: 9,
        november: 10,
        december: 11,
    };

    const monthMatch = deadlineStr.match(/(\d{1,2})\s+([a-z]+)|([a-z]+)\s+(\d{1,2})/);

    if (monthMatch) {
        const day = Number(monthMatch[1] ?? monthMatch[4]);
        const monthStr = (monthMatch[2] ?? monthMatch[3] ?? '').slice(0, 3);
        const month = months[monthStr] ?? months[(monthMatch[2] ?? monthMatch[3] ?? '').toLowerCase()];

        if (!isNaN(day) && month !== undefined) {
            const year = today.getMonth() > month ? today.getFullYear() + 1 : today.getFullYear();

            return new Date(year, month, day);
        }
    }

    // Named days
    const weekdays: Record<string, number> = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
        sun: 0,
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
    };

    for (const [name, dayNum] of Object.entries(weekdays)) {
        if (deadlineStr.includes(name)) {
            const current = today.getDay();
            let diff = dayNum - current;

            if (diff <= 0) {
                diff += 7; // always next occurrence
            }

            if (deadlineStr.includes('next')) {
                diff += 7;
            }

            const result = new Date(today);

            result.setDate(today.getDate() + diff);

            return result;
        }
    }

    // Relative: "end of week", "end of month", "eod", "tomorrow", "today"
    if (deadlineStr.includes('today') || deadlineStr.includes('eod')) {
        return today;
    }

    if (deadlineStr.includes('tomorrow')) {
        const t = new Date(today);

        t.setDate(today.getDate() + 1);

        return t;
    }

    if (deadlineStr.includes('end of week') || deadlineStr.includes('end of next week')) {
        const t = new Date(today);
        const daysToFriday = (5 - today.getDay() + 7) % 7 || 7;

        t.setDate(today.getDate() + daysToFriday + (deadlineStr.includes('next') ? 7 : 0));

        return t;
    }

    if (deadlineStr.includes('end of month')) {
        return new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }

    if (deadlineStr.includes('next week')) {
        const t = new Date(today);

        t.setDate(today.getDate() + 7);

        return t;
    }

    // "in X days/weeks"
    const inDays = deadlineStr.match(/in (\d+) days?/);

    if (inDays) {
        const t = new Date(today);

        t.setDate(today.getDate() + Number(inDays[1]));

        return t;
    }

    const inWeeks = deadlineStr.match(/in (\d+) weeks?/);

    if (inWeeks) {
        const t = new Date(today);

        t.setDate(today.getDate() + Number(inWeeks[1]) * 7);

        return t;
    }

    return null;
}

// Google Calendar format: YYYYMMDD (all-day) or YYYYMMDDTHHmmssZ
function toGoogleDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}${month}${day}`;
}

// Outlook format: YYYY-MM-DDTHH:mm:ss (local time, no Z)
function toOutlookDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}T09:00:00`;
}

// ── Link builders ─────────────────────────────────────────────────────────────
function googleCalendarLink(item: IActionItem, meetingType: string): string {
    const date = parseDeadline(item.deadline);

    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: item.task,
        details: `Owner: ${item.owner}\nPriority: ${item.priority}\nDeadline: ${item.deadline}\n\nCreated by MinutAI from ${meetingType}.`,
    });

    if (date) {
        // All-day event on the deadline date; end = next day
        const start = toGoogleDate(date);
        const end = new Date(date);

        end.setDate(end.getDate() + 1);
        params.set('dates', `${start}/${toGoogleDate(end)}`);
    }

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function outlookLink(item: IActionItem, meetingType: string): string {
    const date = parseDeadline(item.deadline);
    const body = `Owner: ${item.owner}\nPriority: ${item.priority}\nDeadline: ${item.deadline}\n\nCreated by MinutAI from ${meetingType}.`;

    const params = new URLSearchParams({
        path: '/calendar/action/compose',
        rru: 'addevent',
        subject: item.task,
        body,
    });

    if (date) {
        params.set('startdt', toOutlookDate(date));
        const end = new Date(date);

        end.setHours(10);
        params.set('enddt', toOutlookDate(end));
        params.set('allday', 'true');
    }

    return `https://outlook.office.com/calendar/deeplink/compose?${params.toString()}`;
}

export function useCalendar() {
    function getLinks(item: IActionItem, meetingType: string) {
        return {
            google: googleCalendarLink(item, meetingType),
            outlook: outlookLink(item, meetingType),
            hasDate: parseDeadline(item.deadline) !== null,
        };
    }

    // Open all action items with deadlines in sequence (small delay to avoid popup blocker)
    async function openAllInCalendar(items: IActionItem[], meetingType: string, target: 'google' | 'outlook') {
        const withDeadlines = items.filter((i) => i.deadline && i.deadline !== 'No deadline set');

        for (let i = 0; i < withDeadlines.length; i++) {
            const links = getLinks(withDeadlines[i] as IActionItem, meetingType);

            window.open(target === 'google' ? links.google : links.outlook, '_blank');

            if (i < withDeadlines.length - 1) {
                await new Promise((r) => setTimeout(r, 600));
            }
        }
    }

    function itemsWithDeadlines(items: IActionItem[]) {
        return items.filter((i) => i.deadline && i.deadline !== 'No deadline set').length;
    }

    return { getLinks, openAllInCalendar, itemsWithDeadlines };
}
