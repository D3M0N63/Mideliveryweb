import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Reemplaza con la URL y la clave anónima de tu proyecto de Supabase
const supabaseUrl = 'https://bnznogsoxrlxlzyidbhe.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuem5vZ3NveHJseGx6eWlkYmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5ODgwMzQsImV4cCI6MjA3NDU2NDAzNH0.Zg-rBWBVmjWkbBB2vo-gAeL6fh978pR2xTzNmhEs9ws';

// Crea y exporta el cliente de Supabase
export const supabase = createClient(supabaseUrl, supabaseKey);