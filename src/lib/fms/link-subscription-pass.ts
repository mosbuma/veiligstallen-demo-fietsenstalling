import type { FmsCredentials } from "@/lib/fms/client";
import { idcodeForFmsApi } from "@/lib/pass-display";
import { postKoppelpas, postSubscribeLink } from "@/lib/fms/client";

/** idtype voor POST …/idcodes/{idtype}/{code} (CF BaseFMSService.subscribe nieuwe flow). */
export function tempPassIdtypeForKoppelcode(koppelcode: string): { idtype: number; idcode: string } {
  const raw = koppelcode.trim();
  if (raw.startsWith("#")) {
    return { idtype: 3, idcode: raw.slice(1) };
  }
  return { idtype: 4, idcode: raw };
}

export async function linkSubscriptionPass(
  creds: FmsCredentials,
  citycode: string,
  locationId: string,
  koppelcode: string,
  passCode: string,
  passIdType: number
) {
  const code = koppelcode.trim();
  const pass = idcodeForFmsApi(passCode);
  if (/^\d+$/.test(code)) {
    return postSubscribeLink(creds, citycode, locationId, Number(code), {
      idcode: pass,
      idtype: passIdType,
    });
  }
  const temp = tempPassIdtypeForKoppelcode(code);
  return postKoppelpas(creds, citycode, locationId, temp.idtype, temp.idcode, {
    idtype: passIdType,
    idcode: pass,
  });
}
