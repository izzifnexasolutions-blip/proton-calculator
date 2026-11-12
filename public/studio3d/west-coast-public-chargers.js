/* FARIS R+PROTON · West Coast public EV charging reference v1 (12 Nov 2026).
 * Hand-curated from individually identified public Open Charge Map POI pages.
 * POI coordinates and connector ratings are observations, NOT live charger status.
 * OCM community-contributed records: CC BY 4.0 attribution openchargemap.org.
 * Never imply confirmed access/availability or use these as a guaranteed EV route.
 * No Tesla-only chargers, staff-only points or unlabeled inferred pins.
 */
export const WEST_COAST_CATALOG_DATE="2026-11-12";
const rows=[
 // [OCM ID, label, latitude, longitude, DC kW, AC kW, operator, state]
 [474654,"Wisma TNB Alor Setar",6.1220002331,100.3724723211,240,0,"TNB Electron","Kedah"],
 [474286,"Lotus's Stargate, Alor Setar",6.079605123,100.3691295716,50,11,"Gentari / JomCharge","Kedah"],
 [504297,"Tealive DT Setia Sentral, Bukit Mertajam",5.35485854,100.4179724732,24,0,"JomCharge","Pulau Pinang"],
 [471537,"Taman Tasik Taiping",4.85316,100.74597,90,7,"JomCharge","Perak"],
 [302465,"AEON Mall Taiping",4.87335,100.73086,47,0,"TNB Electron","Perak"],
 [299969,"WCE E32 Plaza Tol Taiping Selatan",4.7671650798,100.7270955541,400,0,"DC Handal","Perak"],
 [471720,"Wisma TNB Taiping",4.86185,100.73573,240,0,"TNB Electron","Perak"],
 [188604,"PETRONAS R&R Sungai Perak (Utara)",4.7130013529,100.9449804794,180,0,"Gentari / JomCharge","Perak"],
 [473104,"TNB Electron RPGC Ipoh",4.5883697627,101.1146850179,120,0,"TNB Electron","Perak"],
 [213521,"PETRONAS Jalan Sultan Azlan Shah, Ipoh",4.6210283924,101.1168616968,60,0,"Gentari","Perak"],
 [188593,"R&R Tapah (Selatan)",4.1813910679,101.2892059985,0,22,"chargEV","Perak"],
 [474264,"PETRONAS Hentian Sungai Buloh (Selatan)",3.224706212,101.5770993036,180,0,"Gentari / JomCharge","Selangor"],
 [508237,"Lotus's Selayang",3.222227303,101.6710171428,50,11,"Gentari","Kuala Lumpur"],
 [459498,"Mydin Seremban 2",2.69512,101.903976,60,0,"ChargeSini","Negeri Sembilan"],
 [459500,"Lotus's Seremban 2",2.712631,101.914429,60,0,"ChargeSini","Negeri Sembilan"],
 [459501,"Seremban Gateway",2.716845,101.920074,40,11,"ChargeSini","Negeri Sembilan"],
 [510939,"Jalan S2 A1, Seremban 2",2.7050856798,101.9108016392,120,0,"Tidak diketahui","Negeri Sembilan"],
 [459499,"Mydin Senawang Hypermarket",2.70045,101.979942,60,0,"ChargeSini","Negeri Sembilan"],
 [201461,"PETRONAS Pedas Linggi (Utara)",2.4670944135,102.1201027036,180,0,"Gentari","Negeri Sembilan"],
 [474393,"PETRONAS Ayer Keroh 3",2.2895482527,102.3050116872,110,0,"Gentari","Melaka"],
 [459494,"Mydin MITC Ayer Keroh",2.271234,102.291786,60,0,"ChargeSini","Melaka"],
 [474274,"SQ Spirit, Ayer Keroh",2.2519369233,102.3007435963,30,22,"EVPower","Melaka"],
 [210593,"PETRONAS Bandar Baru Ayer Hitam",1.9326955749,103.1878232354,180,11,"Gentari","Johor"],
 [299297,"Johor Premium Outlets Zone E, Kulai",1.6027549392,103.6224444312,320,22,"DC Handal","Johor"],
 [311348,"Johor Premium Outlets Zone F, Kulai",1.6033024944,103.6234570078,320,0,"DC Handal","Johor"],
 [174397,"Caltex R&R Skudai (Selatan)",1.5899360929,103.6351462545,0,0,"Tidak diketahui","Johor"]
];
export const WEST_COAST_CHARGERS=Object.freeze(rows.map(([id,name,lat,lon,dcKw,acKw,operator,state])=>Object.freeze({
 id,name,lat,lon,dcKw,acKw,operator,state,
 sourceUrl:"https://openchargemap.org/poi/details/"+id,
 publicListing:true, liveVerified:false, preciseSource:"OCM POI"
})));
export function westCoastOcmRecords(){
 return WEST_COAST_CHARGERS.map(s=>({
   ID:s.id,AddressInfo:{Title:s.name,Latitude:s.lat,Longitude:s.lon},
   OperatorInfo:{Title:s.operator},
   UsageType:{IsPublicAccess:true},
   Connections:[
     ...(s.dcKw?[{ConnectionType:{Title:"CCS (Type 2)"},PowerKW:s.dcKw}]:[]),
     ...(s.acKw?[{ConnectionType:{Title:"Type 2 (Tethered Connector)"},PowerKW:s.acKw}]:[])
   ]
 }));
}
