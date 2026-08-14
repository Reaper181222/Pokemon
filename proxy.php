<?php

$url = "https://www.pokexperto.net/index2.php?seccion=nds/nationaldex/estrategia&pk=727";

$ch = curl_init($url);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0");

$html = curl_exec($ch);

curl_close($ch);

if (!$html) {
    http_response_code(500);
    exit("No se pudo obtener la página.");
}

$dom = new DOMDocument();

libxml_use_internal_errors(true);
$dom->loadHTML($html);
libxml_clear_errors();

$xpath = new DOMXPath($dom);

$elemento = $xpath->query("//*[@id='estrategiaSM']")->item(0);

if (!$elemento) {
    http_response_code(404);
    exit("No se encontró estrategiaSM.");
}

echo $dom->saveHTML($elemento);
