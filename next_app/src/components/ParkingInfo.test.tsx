import { renderToStaticMarkup } from "react-dom/server";
import ParkingInfo from "./ParkingInfo";
import { parkingPayload } from "./ParkingLocationInput";

describe("ParkingInfo", () => {
  it("shows a note-only parking as plain text, with no map links", () => {
    const html = renderToStaticMarkup(
      <ParkingInfo lat={null} lng={null} note="חניון חינם מאחורי האולם" fieldName="אולם" />
    );
    expect(html).toContain("חניון חינם מאחורי האולם");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("ניווט לחניה");
  });

  it("offers navigation when there is a pin", () => {
    const html = renderToStaticMarkup(<ParkingInfo lat={32.07} lng={34.78} note={null} />);
    expect(html).toContain("ניווט לחניה");
  });

  it("renders nothing without a pin or a note", () => {
    expect(renderToStaticMarkup(<ParkingInfo lat={null} lng={null} note={null} />)).toBe("");
  });
});

describe("parkingPayload", () => {
  it("sends pin and note independently", () => {
    expect(parkingPayload({ lat: null, lng: null, note: "  רק הערה  " })).toEqual({ parkingNote: "רק הערה" });
    expect(parkingPayload({ lat: 32.07, lng: 34.78, note: "" })).toEqual({ parkingLat: 32.07, parkingLng: 34.78 });
    expect(parkingPayload({ lat: null, lng: null, note: " " })).toEqual({});
  });
});
