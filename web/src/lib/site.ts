import { ZONES, type Zone } from "./places";

export const SUPPORT_EMAIL = "hello@bunkie.xyz";

/** The address Google is told about (canonical tags, sitemap). Production is always the real domain; bunkie.xyz redirects to www. */
export const SITE_URL = process.env.VERCEL_ENV === "production"
  ? "https://www.bunkie.xyz"
  : (process.env.NEXT_PUBLIC_SITE_URL || "https://www.bunkie.xyz").replace(/\/$/, "");

/** "Wuse 2" -> "wuse-2", for the /abuja/[area] pages. */
export const areaSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const zoneBySlug = (slug: string): Zone | undefined => ZONES.find((z) => areaSlug(z.name) === slug);

/** One line per area for its page. Facts only: what's there and how it sits in the city. */
export const AREA_NOTES: Record<string, string> = {
  "Central Area": "Abuja’s Central Business District, close to ministries, banks and many PPAs.",
  Garki: "One of Abuja’s oldest districts, with Area 1, Area 11 and Garki Market, and buses to every part of the city.",
  Wuse: "Busy and central, home to Wuse Market and plenty of offices.",
  "Wuse 2": "Lively district with Banex Plaza and Berger, a short ride to offices in Wuse and Maitama.",
  Maitama: "Quiet, upscale district with embassies, hospitals and government offices.",
  Asokoro: "Calm, upscale district near the Three Arms Zone.",
  Utako: "Busy commercial district beside Jabi and Wuse, with a big interstate motor park.",
  Jabi: "Home to Jabi Lake and Jabi Lake Mall, with quick roads to Utako and Wuse.",
  Wuye: "Quieter district between Utako and Wuse, with Wuye Market nearby.",
  Mabushi: "Central district close to Utako, Jahi and Wuse.",
  Jahi: "Residential district with newer estates, between Gwarinpa and Utako.",
  Kado: "Residential district between Jabi and Life Camp, known for Kado Fish Market.",
  "Life Camp": "Residential area west of Jabi, on the way to Gwarinpa.",
  Gwarinpa: "One of the biggest housing estates in Africa, with shops and markets along its main avenue.",
  Katampe: "Quiet, hilly district near Maitama and Jahi.",
  Dawaki: "Growing residential area past Gwarinpa, with lower rents than the city centre.",
  Kubwa: "Large satellite town on the Kubwa Expressway and home to the FCT NYSC orientation camp.",
  Dutse: "Residential area near Kubwa and Bwari, with lower rents.",
  Mpape: "Hilly area north of Maitama with some of the lowest rents close to the city.",
  Bwari: "Area council north of the city, home to the Nigerian Law School.",
  Durumi: "Central district near Garki and Area 1.",
  Gudu: "Residential district near Apo and Garki, with Gudu Market.",
  Apo: "Residential district south of Garki, close to Gudu and Lokogoma.",
  Lokogoma: "Growing estate district south of the city, with newer houses and good-value rents.",
  Galadimawa: "Residential area around the Galadimawa roundabout, between Lokogoma and Lugbe.",
  Lugbe: "Large, affordable area along the Airport Road.",
  Idu: "Industrial area west of the city, by the Idu train station.",
  Nyanya: "Busy satellite town on the Keffi road, with low rents and plenty of buses into town.",
  Karu: "Satellite town next to Nyanya, with affordable rents.",
  Kuje: "Area council south-west of the city, quieter and with low rents.",
  Gwagwalada: "University town, home to the University of Abuja’s main campus.",
};
