// Supabase Edge Function: generate-journal
// Keeps GROQ_API_KEY strictly on the server (set via `supabase secrets set GROQ_API_KEY=...`).
// Deploy with: `supabase functions deploy generate-journal`

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DailyLogInput {
  description?: string;
  learnings?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const groqApiKey = Deno.env.get('GROQ_API_KEY') ?? '';

    if (!groqApiKey) {
      return new Response(JSON.stringify({ error: 'GROQ_API_KEY secret is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const logs: DailyLogInput[] = Array.isArray(body?.logs) ? body.logs : [];
    if (logs.length === 0) {
      return new Response(JSON.stringify({ error: 'No daily logs provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `You are helping an intern compile their daily notes into a Weekly Progress Report. Read the following daily logs and write TWO paragraphs in the first person ("I"):
1. A summary of the tasks and activities completed during the week.
2. A summary of the overall skills developed and lessons learned.
Write in simple, natural, everyday English. Make it sound human and conversational, like a real student wrote it. Do not use overly complex or formal words.

Daily Logs:
${logs.map((l) => `Tasks: ${l.description || 'N/A'} | Learnings: ${l.learnings || 'N/A'}`).join('\n')}

Respond strictly with a pure JSON object following this exact schema without any markdown formatting:
{
  "activities": "A single paragraph summarizing the tasks.",
  "learnings": "A single paragraph summarizing the learnings."
}`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_completion_tokens: 1024,
        top_p: 1,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      return new Response(
        JSON.stringify({ error: `Groq API request failed (${groqResponse.status}): ${errText}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const responseData = await groqResponse.json();
    const rawContent = String(responseData?.choices?.[0]?.message?.content || '')
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(rawContent);

    return new Response(
      JSON.stringify({
        activities: parsed.activities || '',
        learnings: parsed.learnings || '',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

